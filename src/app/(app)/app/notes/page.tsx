import { redirect } from "next/navigation";
import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import { getDb } from "@/db";
import { getSessionUser } from "@/features/auth/session";
import { listCategories } from "@/features/finance/categories-service";
import { loadWalletsWithBalances } from "@/features/finance/wallets-service";
import { listNoteAttachments } from "@/features/notes/attachments-service";
import { listNoteLinkedTransactions } from "@/features/notes/linked-transactions-service";
import { NOTE_LIST_DEFAULT_LIMIT } from "@/features/notes/schemas";
import { listFolders, listNotes, listTags } from "@/features/notes/service";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const [notesPage, foldersList, tagsList, initialWallets, initialCategories] =
    await Promise.all([
      listNotes(user.id, { limit: NOTE_LIST_DEFAULT_LIMIT }),
      listFolders(user.id),
      listTags(user.id),
      loadWalletsWithBalances(getDb(), user.id),
      listCategories(user.id),
    ]);

  const firstNoteId = notesPage.items[0]?.id;
  const [initialSelectedAttachments, initialLinkedTransactions] = firstNoteId
    ? await Promise.all([
        listNoteAttachments(user.id, firstNoteId),
        listNoteLinkedTransactions(user.id, firstNoteId),
      ])
    : [[], undefined];

  return (
    <NotesWorkspace
      initialNotes={notesPage.items}
      initialNextCursor={notesPage.nextCursor}
      initialFolders={foldersList}
      initialTags={tagsList}
      enableAttachments
      initialSelectedAttachments={initialSelectedAttachments}
      enableLinkedTransactions
      initialWallets={initialWallets}
      initialCategories={initialCategories}
      initialLinkedTransactions={initialLinkedTransactions}
    />
  );
}

