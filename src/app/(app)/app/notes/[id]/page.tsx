import { redirect } from "next/navigation";
import { NoteDetailView } from "@/components/notes/NoteDetailView";
import { getSessionUser } from "@/features/auth/session";
import {
  listNoteAttachments,
  type NoteAttachmentDto,
} from "@/features/notes/attachments-service";
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
  if (parsedId.success) {
    try {
      note = await getNoteById(user.id, parsedId.data);
      initialAttachments = await listNoteAttachments(user.id, note.id);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        throw error;
      }
    }
  }

  const foldersList = await listFolders(user.id);

  return (
    <NoteDetailView
      initialNote={note}
      initialFolders={foldersList}
      enableAttachments
      initialAttachments={initialAttachments}
    />
  );
}

