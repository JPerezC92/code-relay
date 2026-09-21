import { fireEvent, render, screen } from '@testing-library/react-native';
import { PermissionCard } from '@/modules/session/components/PermissionCard';
import type { PermissionRequest } from '@/modules/session/domain/entities/session';

const PERMISSION: PermissionRequest = {
  id: 'permission-1',
  sessionId: 'session-1',
  title: 'Run a shell command?',
};

describe('PermissionCard', () => {
  it('renders exactly the approve-once and reject actions', async () => {
    await render(
      <PermissionCard
        permission={PERMISSION}
        onApproveOnce={() => {}}
        onReject={() => {}}
      />,
    );

    expect(screen.getByText('Approve once')).toBeTruthy();
    expect(screen.getByText('Reject')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByText(/always/i)).toBeNull();
    expect(screen.queryByText(/remember/i)).toBeNull();
  });

  it('reports once and reject through the matching callbacks', async () => {
    const onApproveOnce = jest.fn();
    const onReject = jest.fn();

    await render(
      <PermissionCard
        permission={PERMISSION}
        onApproveOnce={onApproveOnce}
        onReject={onReject}
      />,
    );

    await fireEvent.press(screen.getByText('Approve once'));
    expect(onApproveOnce).toHaveBeenCalledTimes(1);
    expect(onReject).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Reject'));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onApproveOnce).toHaveBeenCalledTimes(1);
  });
});
