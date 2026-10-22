import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Table,
  Td,
  Th,
  Tr,
  useToast,
} from '../../components/ui';
import { api, apiFetch } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { errorMessage } from '../tickets/api';

/** A backup archive on the server. */
export interface BackupSummary {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string;
  tables: number;
  rows: number;
  attachments: number;
  missingAttachments: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminBackupsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [restoreOpen, setRestoreOpen] = useState(false);

  const backups = useQuery({
    queryKey: ['admin', 'backups'],
    queryFn: () => api.get<{ backups: BackupSummary[] }>('/api/v1/admin/backups'),
  });

  const status = useQuery({
    queryKey: ['admin', 'backups', 'status'],
    queryFn: () => api.get<{ restoreInProgress: boolean }>('/api/v1/admin/backups/status'),
    refetchInterval: 10_000,
  });

  const createBackup = useMutation({
    mutationFn: () => api.post<{ backup: BackupSummary }>('/api/v1/admin/backups'),
    onSuccess: (result) => {
      toast.push({
        tone: 'success',
        title: 'Backup created',
        description: `${result.backup.rows} rows and ${result.backup.attachments} attachments saved.`,
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
    },
    onError: (error) => {
      toast.push({ tone: 'error', title: 'Backup failed', description: errorMessage(error) });
    },
  });

  const deleteBackup = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/backups/${id}`),
    onSuccess: () => {
      toast.push({ tone: 'success', title: 'Backup deleted' });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
    },
    onError: (error) => {
      toast.push({ tone: 'error', title: 'Delete failed', description: errorMessage(error) });
    },
  });

  const download = async (backup: BackupSummary) => {
    try {
      const blob = await apiFetch<Blob>(`/api/v1/admin/backups/${backup.id}/download`, {
        raw: true,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = backup.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.push({ tone: 'error', title: 'Download failed', description: errorMessage(error) });
    }
  };

  const items = backups.data?.backups ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Backup &amp; restore</h1>
          <p className="text-sm text-slate-500">
            A backup is a single archive holding every table and every attachment. Restoring one
            puts the whole platform back exactly as it was.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setRestoreOpen(true)}>
            Restore from archive
          </Button>
          <Button onClick={() => createBackup.mutate()} loading={createBackup.isPending}>
            Create backup
          </Button>
        </div>
      </header>

      {status.data?.restoreInProgress ? (
        <div
          role="status"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          A restore is running. The background worker is paused until it finishes.
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Stored backups"
          description="The newest archive is kept automatically when older ones are pruned."
        />
        {backups.isLoading ? (
          <LoadingState />
        ) : backups.isError ? (
          <CardBody>
            <ErrorState description={errorMessage(backups.error)} />
          </CardBody>
        ) : items.length === 0 ? (
          <EmptyState title="No backups yet" description="Create one before you need it." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Created</Th>
                <Th>Taken by</Th>
                <Th>Records</Th>
                <Th>Attachments</Th>
                <Th>Size</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((backup) => (
                <Tr key={backup.id}>
                  <Td className="text-xs text-slate-600">{formatDateTime(backup.createdAt)}</Td>
                  <Td className="text-sm text-slate-800">{backup.createdBy}</Td>
                  <Td className="text-xs text-slate-600">
                    {backup.rows} rows across {backup.tables} tables
                  </Td>
                  <Td className="text-xs text-slate-600">
                    {backup.attachments}
                    {backup.missingAttachments > 0 ? (
                      <span className="ml-1 text-amber-700">
                        ({backup.missingAttachments} missing)
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-xs text-slate-600">{formatBytes(backup.sizeBytes)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="secondary" onClick={() => void download(backup)}>
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => deleteBackup.mutate(backup.id)}
                        loading={deleteBackup.isPending && deleteBackup.variables === backup.id}
                      >
                        Delete
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <RestoreDialog
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        onRestored={() => {
          setRestoreOpen(false);
          toast.push({ tone: 'success', title: 'The platform has been restored' });
          void queryClient.invalidateQueries();
        }}
      />
    </div>
  );
}

/**
 * The restore confirmation. Restoring replaces every record, so the operator
 * has to pick the file and type the confirmation phrase.
 */
function RestoreDialog({
  open,
  onClose,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(null);
      setConfirmation('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!file) {
      setError('Choose a backup archive first.');
      return;
    }
    if (confirmation.trim().toUpperCase() !== 'RESTORE') {
      setError('Type RESTORE to confirm.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('archive', file);
      await api.post('/api/v1/admin/backups/restore', form);
      onRestored();
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      toast.push({ tone: 'error', title: 'Restore failed', description: message });
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Restore the platform"
      description="Every record and every attachment is replaced with the contents of the archive."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={pending}>
            Restore
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <FormField label="Backup archive" htmlFor="restore-file" required>
          <Input
            id="restore-file"
            type="file"
            accept=".gz,.tgz,application/gzip"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </FormField>
        <FormField label="Type RESTORE to confirm" htmlFor="restore-confirmation" required>
          <Input
            id="restore-confirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </FormField>
        <p className="text-xs text-slate-500">
          The background worker is paused while the restore runs, so nothing is delivered against a
          half-restored system. Sign in again afterwards.
        </p>
      </div>
    </Dialog>
  );
}
