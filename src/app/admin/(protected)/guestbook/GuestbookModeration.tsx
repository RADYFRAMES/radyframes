'use client';

import { useActionState } from 'react';
import { moderateGuestbookEntry, type GuestbookModerationState } from './actions';

interface Entry {
  id: string;
  public_name: string;
  message: string;
  status: 'pending' | 'approved' | 'hidden';
  created_at: string;
}

const initialState: GuestbookModerationState = { status: 'idle', message: '' };

function ModerationRow({ entry }: { entry: Entry }) {
  const [state, action, pending] = useActionState(moderateGuestbookEntry, initialState);
  return (
    <article className="card guestbookAdminEntry">
      <div className="guestbookAdminHead">
        <div><h2>{entry.public_name}</h2><p className="mut">{new Date(entry.created_at).toLocaleString()}</p></div>
        <span className={`reviewStatus reviewStatus-${entry.status}`}>{entry.status}</span>
      </div>
      <p className="guestbookAdminMessage">{entry.message}</p>
      <form action={action} className="guestbookModerationActions">
        <input type="hidden" name="id" value={entry.id} />
        <button className="btn" name="status" value="approved" disabled={pending || entry.status === 'approved'}>Approve publicly</button>
        <button className="btn ghost" name="status" value="pending" disabled={pending || entry.status === 'pending'}>Return to pending</button>
        <button className="btn danger" name="status" value="hidden" disabled={pending || entry.status === 'hidden'} onClick={(event) => {
          if (!window.confirm('Hide this message from the public guestbook? The record will remain in the admin archive.')) event.preventDefault();
        }}>Hide</button>
        {state.message && <p className={state.status === 'error' ? 'err' : 'ok'} role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
      </form>
    </article>
  );
}

export default function GuestbookModeration({ entries }: { entries: Entry[] }) {
  return (
    <div className="guestbookAdminList">
      {entries.map((entry) => <ModerationRow key={entry.id} entry={entry} />)}
      {!entries.length && <p className="mut">No guestbook submissions are waiting in the database.</p>}
    </div>
  );
}
