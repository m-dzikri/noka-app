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

  const noteBundlePromise = (async () => {
    if (!parsedId.success) {
      return {
        note: null as NoteDto | null,
        initialAttachments: [] as NoteAttachmentDto[],
        initialLinkedTransactions: undefined as
          | LinkedTransactionsListResult
          | undefined,
      };
    }

    try {
      const [note, initialAttachments, initialLinkedTransactions] =
        await Promise.all([
          getNoteById(user.id, parsedId.data),
          listNoteAttachments(user.id, parsedId.data),
          listNoteLinkedTransactions(user.id, parsedId.data),
        ]);
      return { note, initialAttachments, initialLinkedTransactions };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return {
          note: null as NoteDto | null,
          initialAttachments: [] as NoteAttachmentDto[],
          initialLinkedTransactions: undefined as
            | LinkedTransactionsListResult
            | undefined,
        };
      }
      throw error;
    }
  })();

  const [
    { note, initialAttachments, initialLinkedTransactions },
    foldersList,
    initialWallets,
    initialCategories,
  ] = await Promise.all([
    noteBundlePromise,
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

