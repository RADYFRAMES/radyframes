import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageThumbnails } from '@/lib/auth/thumbnail-authorization';
import { getGitHubThumbnailConfig, GitHubIntegrationError, GitHubThumbnailRepository } from '@/lib/github/thumbnail-repository';
import { isThumbnailPathColumnMissing } from '@/lib/portfolio/thumbnail';
import { MultipartBodyTooLargeError, withMultipartBodyLimit } from '@/lib/thumbnails/multipart';
import { optimizeThumbnail, MAX_THUMBNAIL_UPLOAD_BYTES, ThumbnailValidationError } from '@/lib/thumbnails/validation';
import { reconcileThumbnailPathSave, uploadAndAssignThumbnail } from '@/lib/thumbnails/upload-workflow';

export const runtime = 'nodejs';
export const maxDuration = 60;

const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MULTIPART_BYTES = MAX_THUMBNAIL_UPLOAD_BYTES + 64 * 1024;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function validationMessage(error: ThumbnailValidationError) {
  switch (error.code) {
    case 'empty': return 'Choose an image to upload.';
    case 'too_large': return 'Image must be 8 MB or smaller.';
    case 'unsupported_type': return 'Use a JPEG, PNG, or WebP image.';
    case 'mime_mismatch': return 'The image content does not match its declared file type.';
    case 'extension_mismatch': return 'The image filename extension does not match its content.';
    case 'invalid_image': return 'The image is malformed or cannot be decoded.';
    case 'invalid_dimensions': return 'Image dimensions are unsupported. Use at least 320 × 180 pixels and no more than 8192 pixels on either side.';
    case 'optimized_too_large': return 'The optimized image exceeds the 5 MB storage limit.';
  }
}

function githubErrorResponse(error: GitHubIntegrationError) {
  switch (error.code) {
    case 'configuration':
      return response({ message: 'GitHub App configuration is incomplete or invalid.' }, 503);
    case 'authentication':
      return response({ message: 'GitHub App authentication failed. Confirm the app installation and Contents permission.' }, 502);
    case 'network':
      return response({ message: 'GitHub is temporarily unavailable. No project path was saved.' }, 502);
    case 'file_exists':
      return response({ message: 'That image already exists in the configured repository. Choose a different image.' }, 409);
    case 'branch_conflict':
      return response({ message: 'GitHub rejected the commit because the branch or file changed. No project path was saved.' }, 409);
    case 'content_mismatch':
      return response({ message: 'The optimized image hash did not match its content. No file was uploaded.' }, 422);
    case 'not_created':
      return response({
        message: 'GitHub confirmed the thumbnail was not created. No project path was saved; you can safely retry.',
        recoverable: true,
      }, 502);
    case 'outcome_unknown':
      return response({
        message: 'GitHub may have stored the thumbnail, but its contents could not be verified. No project path was saved; retry later. Existing files will not be overwritten.',
        recoverable: true,
      }, 503);
    case 'request':
      return response({ message: 'GitHub could not store the image. No project path was saved.' }, 502);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestOrigin = request.headers.get('origin');
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(requestOrigin) && new URL(requestOrigin!).origin === new URL(request.url).origin;
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) {
    return response({ message: 'This upload request is not allowed.' }, 403);
  }

  const { id } = await params;
  if (!projectIdPattern.test(id)) return response({ message: 'Project ID is invalid.' }, 400);

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return response({ message: 'Admin authentication is unavailable. Check the server configuration.' }, 503);
  }
  let user;
  let authError;
  try {
    const authResult = await supabase.auth.getUser();
    user = authResult.data.user;
    authError = authResult.error;
  } catch {
    return response({ message: 'Admin authentication could not be verified.' }, 503);
  }
  if (authError || !user) return response({ message: 'Sign in as a super admin to upload thumbnails.' }, 401);

  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (adminError) return response({ message: 'Admin authorization could not be verified.' }, 503);
  if (!canManageThumbnails(admin?.role)) {
    return response({ message: 'Only super admins can upload project thumbnails.' }, 403);
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id,thumbnail_path')
    .eq('id', id)
    .maybeSingle();
  if (projectError) {
    if (isThumbnailPathColumnMissing(projectError)) {
      return response({ message: 'Thumbnail storage is unavailable until the owner-approved migration 006 is applied.' }, 503);
    }
    return response({ message: 'The project could not be verified. No upload was started.' }, 500);
  }
  if (!project) return response({ message: 'Project not found or not accessible.' }, 404);

  let configResult;
  try {
    configResult = getGitHubThumbnailConfig();
  } catch {
    return response({ message: 'GitHub App configuration is invalid.' }, 503);
  }
  if (!configResult.config) {
    return response({ message: 'GitHub App storage is not configured on this server.' }, 503);
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_MULTIPART_BYTES) {
    return response({ message: 'Upload must be no larger than 8 MB.' }, 413);
  }

  let formData: FormData;
  try {
    formData = await withMultipartBodyLimit(request, MAX_MULTIPART_BYTES).formData();
  } catch (error) {
    if (error instanceof MultipartBodyTooLargeError) {
      return response({ message: 'Upload must be no larger than 8 MB.' }, 413);
    }
    return response({ message: 'Upload form data could not be read.' }, 400);
  }
  const file = formData.get('file');
  if (!(file instanceof File)) return response({ message: 'Choose an image file to upload.' }, 400);
  if (project.thumbnail_path && formData.get('confirm_replace') !== 'true') {
    return response({ message: 'Confirm replacement of the currently assigned thumbnail.' }, 409);
  }
  if (file.size > MAX_THUMBNAIL_UPLOAD_BYTES) {
    return response({ message: 'Image must be 8 MB or smaller.' }, 413);
  }

  let optimized;
  try {
    optimized = await optimizeThumbnail(Buffer.from(await file.arrayBuffer()), file.type, file.name);
  } catch (error) {
    if (error instanceof ThumbnailValidationError) {
      return response({ message: validationMessage(error) }, error.code === 'too_large' ? 413 : 422);
    }
    return response({ message: 'The selected image could not be processed.' }, 422);
  }

  const storage = new GitHubThumbnailRepository(configResult.config);
  let result;
  try {
    result = await uploadAndAssignThumbnail({
      projectId: project.id,
      currentPath: project.thumbnail_path,
      contentHash: optimized.contentHash,
      bytes: optimized.bytes,
      storage,
      savePath: (thumbnailPath) => reconcileThumbnailPathSave({
        previousPath: project.thumbnail_path,
        newPath: thumbnailPath,
        update: async () => {
          let update = supabase
            .from('projects')
            .update({ thumbnail_path: thumbnailPath })
            .eq('id', project.id);
          update = project.thumbnail_path !== null
            ? update.eq('thumbnail_path', project.thumbnail_path)
            : update.is('thumbnail_path', null);
          const { data, error } = await update.select('id').maybeSingle();
          return !error && Boolean(data);
        },
        readCurrentPath: async () => {
          const { data, error } = await supabase
            .from('projects')
            .select('thumbnail_path')
            .eq('id', project.id)
            .maybeSingle();
          if (error || !data) return undefined;
          return data.thumbnail_path;
        },
      }),
    });
  } catch (error) {
    if (error instanceof GitHubIntegrationError) return githubErrorResponse(error);
    return response({ message: 'Thumbnail storage failed. No project path was saved.' }, 502);
  }

  if (result.status === 'assignment_indeterminate') {
    revalidatePath('/');
    revalidatePath('/admin/projects');
    return response({
      message: 'The project update could not be confirmed. The uploaded image was retained to avoid breaking a possible assignment. Reload the project before retrying.',
      recoverable: true,
    }, 503);
  }

  if (result.status === 'assignment_failed_retained') {
    return response({
      message: 'The project thumbnail was not updated. The existing repository image was retained because it may already be in use. Reload the project before retrying.',
      recoverable: true,
    }, 503);
  }

  if (result.status === 'failed') {
    return response({
      message: result.orphanedPath
        ? `The project could not be updated and the uploaded file could not be removed. Orphaned file: ${result.orphanedPath}`
        : 'The project could not be updated. The newly uploaded file was removed; no thumbnail was assigned.',
      orphanedPath: result.orphanedPath ?? null,
    }, 500);
  }

  revalidatePath('/');
  revalidatePath('/admin/projects');
  if (result.status === 'saved_with_orphan') {
    return response({
      ok: true,
      thumbnailPath: result.publicPath,
      warning: `Thumbnail assigned, but the previous file remains unreferenced: ${result.orphanedPath}`,
    }, 200);
  }
  return response({ ok: true, thumbnailPath: result.publicPath }, 200);
}
