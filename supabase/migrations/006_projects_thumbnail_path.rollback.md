# Rollback: project thumbnail path

Only use this rollback after owner approval and after the application no longer
reads or writes `projects.thumbnail_path`.

The migration adds a nullable column and does not change existing project rows.
Dropping the column permanently removes every assigned custom thumbnail path;
it does not remove files already committed under `public/thumbnails/`.

After confirming that the data can be discarded and taking any needed backup,
an owner may run the following in the intended Supabase project's SQL Editor:

```sql
alter table public.projects drop column thumbnail_path;
```

No rollback SQL has been executed.
