'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PortfolioProject } from '@/lib/portfolio/types';
import { isProjectThumbnailPath } from '@/lib/portfolio/thumbnail';
import ProjectThumbnailImage from '@/components/ProjectThumbnailImage';

type UploadMessage = { kind: 'success' | 'warning' | 'error'; text: string };

export default function ThumbnailManager({
  projects,
  enabled,
  disabledReason,
}: {
  projects: PortfolioProject[];
  enabled: boolean;
  disabledReason: string | null;
}) {
  const [selectedId, setSelectedId] = useState(projects[0]?.id ?? '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<UploadMessage | null>(null);
  const [assignedPaths, setAssignedPaths] = useState<Record<string, string | null>>(
    () => Object.fromEntries(projects.map((project) => [project.id, project.thumbnail_path ?? null])),
  );
  const selectedProject = projects.find((project) => project.id === selectedId) ?? null;
  const assignedPath = selectedProject
    ? assignedPaths[selectedProject.id] ?? selectedProject.thumbnail_path ?? null
    : null;
  const previewProject = useMemo(
    () => selectedProject ? { ...selectedProject, thumbnail_path: assignedPath } : null,
    [assignedPath, selectedProject],
  );
  const hasCustomThumbnail = Boolean(selectedProject && isProjectThumbnailPath(assignedPath, selectedProject.id));
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function selectFile(file: File | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = file ? URL.createObjectURL(file) : null;
    setSelectedFile(file);
    setPreviewUrl(previewUrlRef.current);
  }

  function upload() {
    if (!selectedProject || !selectedFile || !enabled || uploading) return;
    if (assignedPath && !window.confirm('Replace the currently assigned custom thumbnail?')) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('confirm_replace', assignedPath ? 'true' : 'false');
    const request = new XMLHttpRequest();
    request.open('POST', `/api/admin/projects/${encodeURIComponent(selectedProject.id)}/thumbnail`);
    setUploading(true);
    setProgress(0);
    setMessage(null);

    request.upload.onprogress = (event) => {
      setProgress(event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null);
    };
    request.onload = () => {
      let payload: { ok?: boolean; message?: string; warning?: string; recoverable?: boolean; thumbnailPath?: string };
      try {
        payload = JSON.parse(request.responseText) as typeof payload;
      } catch {
        payload = {};
      }
      if (request.status >= 200 && request.status < 300 && payload.ok && payload.thumbnailPath) {
        setAssignedPaths((current) => ({ ...current, [selectedProject.id]: payload.thumbnailPath ?? null }));
        setMessage({
          kind: payload.warning ? 'warning' : 'success',
          text: payload.warning ?? 'Thumbnail uploaded and assigned.',
        });
        selectFile(null);
      } else {
        setMessage({
          kind: payload.recoverable ? 'warning' : 'error',
          text: payload.message ?? 'Thumbnail upload failed.',
        });
      }
      setUploading(false);
      setProgress(null);
    };
    request.onerror = () => {
      setMessage({ kind: 'error', text: 'Upload connection failed. Check whether the project thumbnail was saved before retrying.' });
      setUploading(false);
      setProgress(null);
    };
    request.onabort = () => {
      setMessage({ kind: 'error', text: 'Upload was cancelled. Check the project before retrying.' });
      setUploading(false);
      setProgress(null);
    };
    request.send(formData);
  }

  return (
    <section className="card thumbnailManager" aria-labelledby="thumbnail-manager-title">
      <div className="thumbnailManagerHeading">
        <div><p className="eyebrow">PROJECT MEDIA</p><h2 id="thumbnail-manager-title">Thumbnail manager</h2></div>
        <p className="mut">Custom images are optimized and versioned in the configured GitHub repository.</p>
      </div>
      {!enabled && disabledReason && <p className="reviewDatabaseNotice" role="status">{disabledReason}</p>}
      {!projects.length ? (
        <p className="mut">Save a project first to assign a thumbnail.</p>
      ) : (
        <>
          <label>Select project
            <select value={selectedId} onChange={(event) => {
              setSelectedId(event.target.value);
              selectFile(null);
              setMessage(null);
            }}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title || project.topic || project.client || project.youtube_id || 'Untitled project'}
                </option>
              ))}
            </select>
          </label>
          {selectedProject && previewProject && (
            <div className="thumbnailManagerGrid">
              <div>
                <p className="thumbnailManagerLabel">{hasCustomThumbnail ? 'Currently assigned custom thumbnail' : 'Current thumbnail · YouTube fallback'}</p>
                <div className="thumbnailManagerImage">
                  <ProjectThumbnailImage
                    project={previewProject}
                    sizes="(max-width: 700px) 90vw, 320px"
                    fallback={<span className="mut">Thumbnail unavailable</span>}
                  />
                </div>
              </div>
              <div>
                <p className="thumbnailManagerLabel">Upload preview</p>
                <div className="thumbnailManagerImage">
                  {previewUrl
                    ? <Image src={previewUrl} alt="Selected thumbnail preview" fill unoptimized sizes="(max-width: 700px) 90vw, 320px" />
                    : <span className="mut">Choose an image to preview.</span>}
                </div>
              </div>
            </div>
          )}
          <label>Choose image<input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={!enabled || uploading}
            onChange={(event) => {
              selectFile(event.target.files?.[0] ?? null);
              setMessage(null);
            }}
          /></label>
          {selectedFile && <p className="mut">{selectedFile.name} · {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>}
          {uploading && <progress className="thumbnailUploadProgress" max="100" value={progress ?? undefined} aria-label="Thumbnail upload progress" />}
          {message && <p className={message.kind === 'error' ? 'err' : message.kind === 'warning' ? 'reviewDatabaseNotice' : 'ok'} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
          <button className="btn" type="button" disabled={!enabled || !selectedFile || uploading} onClick={upload}>
            {uploading ? `Uploading${progress === null ? '…' : ` ${progress}%`}` : hasCustomThumbnail ? 'Replace custom thumbnail' : 'Upload custom thumbnail'}
          </button>
        </>
      )}
    </section>
  );
}
