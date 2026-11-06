import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Api } from '../api.js';
import { useApi, useToast } from '../context.jsx';
import { LeaveForm } from '../components/LeaveForm.jsx';
import { ErrorState, PageHeader, Spinner } from '../components/ui.jsx';

export function ApplyLeavePage() {
  const navigate = useNavigate();
  const toast = useToast();

  return (
    <>
      <PageHeader title="Apply for leave" subtitle="Weekends are not counted. Leave of more than 3 working days needs a document and HOD approval." />
      <LeaveForm
        submitLabel="Submit request"
        onCancel={() => navigate(-1)}
        onSubmit={async (form) => {
          const { leave } = await Api.createLeave(form);
          toast.success(`Leave request #${leave.id} submitted. It's now with ${(leave.managerApprover ?? leave.hodApprover).name}.`);
          navigate(`/leaves/${leave.id}`);
        }}
      />
    </>
  );
}

export function EditLeavePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => Api.leave(id), [id]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const leave = data.leave;
  if (!leave.permissions.canEdit) return <Navigate to={`/leaves/${id}`} replace />;

  return (
    <>
      <PageHeader
        back={
          <Link to={`/leaves/${id}`} className="back-link">
            ← Back to request #{id}
          </Link>
        }
        title={`Edit request #${id}`}
        subtitle="Saving changes restarts the approval from level 1, so every approver sees the final details."
      />
      <LeaveForm
        initial={{ leaveType: leave.leaveType, dayPart: leave.dayPart ?? 'FULL', fromDate: leave.fromDate, toDate: leave.toDate, reason: leave.reason }}
        existingDocumentCount={leave.documents.length}
        existingLeave={leave}
        submitLabel="Save changes"
        onCancel={() => navigate(`/leaves/${id}`)}
        onSubmit={async (form) => {
          await Api.updateLeave(id, form);
          toast.success('Changes saved. The request is back with your manager.');
          navigate(`/leaves/${id}`);
        }}
      />
    </>
  );
}
