import { redirect } from "next/navigation";
import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import { getSessionUser } from "@/features/auth/session";
import { listNoteAttachments } from "@/features/notes/attachments-service";
import { NOTE_LIST_DEFAULT_LIMIT } from "@/features/notes/schemas";
import { listFolders, listNotes, listTags } from "@/features/notes/service";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const [notesPage, foldersList, tagsList] = await Promise.all([
    listNotes(user.id, { limit: NOTE_LIST_DEFAULT_LIMIT }),
    listFolders(user.id),
    listTags(user.id),
  ]);

  const firstNoteId = notesPage.items[0]?.id;
  const initialSelectedAttachments = firstNoteId
    ? await listNoteAttachments(user.id, firstNoteId)
    : [];

  return (
    <NotesWorkspace
      initialNotes={notesPage.items}
      initialNextCursor={notesPage.nextCursor}
      initialFolders={foldersList}
      initialTags={tagsList}
      enableAttachments
      initialSelectedAttachments={initialSelectedAttachments}
    />
  );
}

