import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ScheduleSettingsCard } from '@/features/profile/components/ScheduleSettingsCard';
import { useUserProfile } from '@/features/profile/context/UserProfileContext';
import { updateSchedule } from '@/lib/api/scheduleService';

jest.mock('@/features/profile/context/UserProfileContext');
jest.mock('@/lib/api/scheduleService', () => {
  const actual = jest.requireActual('@/lib/api/scheduleService');
  return {
    ...actual,
    updateSchedule: jest.fn(),
  };
});

const mockedUseUserProfile = useUserProfile as jest.Mock;
const mockedUpdateSchedule = updateSchedule as jest.Mock;

const renderCard = (profileOverrides: Record<string, unknown> = {}) => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  mockedUseUserProfile.mockReturnValue({
    profile: {
      schedulerEnabled: true,
      scheduleIntervalDays: 7,
      nextRunAt: undefined,
      ...profileOverrides,
    },
    refresh,
  });
  return { refresh, ...render(<ScheduleSettingsCard />) };
};

describe('ScheduleSettingsCard', () => {
  it('renders only the Daily/Weekly/Monthly preset controls (no numeric day input)', () => {
    renderCard();

    expect(screen.getByRole('button', { name: 'Daily' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weekly' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Monthly' })).toBeInTheDocument();
    expect(document.querySelector('input[type="number"]')).not.toBeInTheDocument();
    expect(document.querySelector('input')).not.toBeInTheDocument();
  });

  it('calls updateSchedule with { scheduleIntervalDays: 1 } when Daily is clicked', async () => {
    mockedUpdateSchedule.mockResolvedValue({});
    const { refresh } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Daily' }));

    await waitFor(() => {
      expect(mockedUpdateSchedule).toHaveBeenCalledWith({ scheduleIntervalDays: 1 });
    });
    await waitFor(() => {
      expect(refresh).toHaveBeenCalledWith(true);
    });
  });

  it('renders the thrown error message inline when the save fails', async () => {
    mockedUpdateSchedule.mockRejectedValue(new Error('scheduleIntervalDays must be 1, 7, or 30'));
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Daily' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('scheduleIntervalDays must be 1, 7, or 30');
    });
  });
});
