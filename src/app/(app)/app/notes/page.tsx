import { redirect } from "next/navigation";
import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import { getSessionUser } from "@/features/auth/session";
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

  return (
    <NotesWorkspace
      initialNotes={notesPage.notes}
      initialNextCursor={notesPage.nextCursor}
      initialHasMore={notesPage.hasMore}
      initialFolders={foldersList}
      initialTags={tagsList}
    />
  );
}

