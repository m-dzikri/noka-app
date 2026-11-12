import { redirect } from "next/navigation";
import { NoteDetailView } from "@/components/notes/NoteDetailView";
import { getDb } from "@/db";
import { getSessionUser } from "@/features/auth/session";
import { listCategories } from "@/features/finance/categories-service";
import { loadWalletsWithBalances } from "@/features/finance/wallets-service";
import {
  listNoteAttachments,
  type NoteAttachmentDto,
} from "@/features/notes/attachments-service";
import {
  listNoteLinkedTransactions,
  type LinkedTransactionsListResult,
} from "@/features/notes/linked-transactions-service";
import { uuidSchema } from "@/features/notes/schemas";
import { getNoteById, listFolders, type NoteDto } from "@/features/notes/service";
import { ApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

interface NoteDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function NoteDetailPage({ params }: NoteDetailPageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const parsedId = uuidSchema.safeParse(id);

  let note: NoteDto | null = null;
  let initialAttachments: NoteAttachmentDto[] = [];
  let initialLinkedTransactions: LinkedTransactionsListResult | undefined;
  if (parsedId.success) {
    try {
      note = await getNoteById(user.id, parsedId.data);
      [initialAttachments, initialLinkedTransactions] = await Promise.all([
        listNoteAttachments(user.id, note.id),
        listNoteLinkedTransactions(user.id, note.id),
      ]);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        throw error;
      }
    }
  }

  const [foldersList, initialWallets, initialCategories] = await Promise.all([
    listFolders(user.id),
    loadWalletsWithBalances(getDb(), user.id),
    listCategories(user.id),
  ]);

  return (
    <NoteDetailView
      routeNoteId={parsedId.success ? parsedId.data : id}
      initialNote={note}
      initialFolders={foldersList}
      enableAttachments
      initialAttachments={initialAttachments}
      enableLinkedTransactions
      initialWallets={initialWallets}
      initialCategories={initialCategories}
      initialLinkedTransactions={initialLinkedTransactions}
    />
  );
}

