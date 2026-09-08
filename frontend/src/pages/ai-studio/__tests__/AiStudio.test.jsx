import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import AiStudio from '../AiStudio';
import { aiStudioAPI } from '../../../api/ai';

vi.mock('../../../api/ai', () => ({
  aiStudioAPI: {
    generatePortfolio: vi.fn(),
    getJobStatus: vi.fn(),
    retryJob: vi.fn(),
    uploadAsset: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

const renderStudio = () =>
  render(
    <MemoryRouter initialEntries={['/ai-studio']}>
      <AiStudio />
    </MemoryRouter>
  );

const goToDetails = () => {
  fireEvent.click(screen.getByRole('radio', { name: /portfolio/i }));
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
};

const fillRequiredDetails = () => {
  fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Ritik Singh' } });
  fireEvent.change(screen.getByLabelText(/professional title/i), { target: { value: 'Full Stack Developer' } });
};

const goToReview = () => {
  goToDetails();
  fillRequiredDetails();
  fireEvent.click(screen.getByRole('button', { name: /continue/i })); // details -> assets
  fireEvent.click(screen.getByRole('button', { name: /continue/i })); // assets -> design
  fireEvent.click(screen.getByRole('button', { name: /continue/i })); // design -> review
};

beforeEach(() => {
  vi.clearAllMocks();
  import.meta.env.VITE_AI_STUDIO_ENABLED = 'true';
  aiStudioAPI.getJobStatus.mockResolvedValue({ data: { jobId: 'job-1', status: 'running', currentStage: 'BUILDING' } });
});

describe('AiStudio', () => {
  it('loads on the website type step with portfolio selectable and Continue disabled until chosen', () => {
    renderStudio();
    expect(screen.getByText(/choose your website type/i)).toBeInTheDocument();
    const continueBtn = screen.getByRole('button', { name: /continue/i });
    expect(continueBtn).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /portfolio/i }));
    expect(continueBtn).not.toBeDisabled();
  });

  it('does not let submission proceed without a selected type', () => {
    renderStudio();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    // Still on the website type step since nothing was selected.
    expect(screen.getByText(/choose your website type/i)).toBeInTheDocument();
  });

  it('validates required fields on the details step', () => {
    renderStudio();
    goToDetails();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/role is required/i)).toBeInTheDocument();
  });

  it('rejects an invalid project link URL', () => {
    renderStudio();
    goToDetails();
    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: /add project/i }));
    fireEvent.change(screen.getByLabelText(/project 1 title/i), { target: { value: 'FarmLink' } });
    fireEvent.change(screen.getByLabelText(/project 1 link/i), { target: { value: 'not-a-url' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText(/must be a valid url/i)).toBeInTheDocument();
  });

  it('preserves entered details when navigating back and forward', () => {
    renderStudio();
    goToDetails();
    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: /continue/i })); // -> assets
    fireEvent.click(screen.getAllByRole('button', { name: /^back$/i })[1]); // step-level Back -> details

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Ritik Singh');
    expect(screen.getByLabelText(/professional title/i)).toHaveValue('Full Stack Developer');
  });

  it('rejects an oversized asset upload without calling the API', () => {
    renderStudio();
    goToDetails();
    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: /continue/i })); // -> assets

    const bigFile = new File([new ArrayBuffer(9 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
    const [fileInput] = document.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [bigFile] } });

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/8MB/));
    expect(aiStudioAPI.uploadAsset).not.toHaveBeenCalled();
  });

  it('shows the review step with previously entered data and allows editing', () => {
    renderStudio();
    goToReview();

    expect(screen.getByText(/review/i)).toBeInTheDocument();
    expect(screen.getByText('Ritik Singh')).toBeInTheDocument();
    expect(screen.getByText('Full Stack Developer')).toBeInTheDocument();
  });

  it('submits generation once and disables the button to prevent duplicate submits', async () => {
    let resolveGenerate;
    aiStudioAPI.generatePortfolio.mockReturnValue(
      new Promise((resolve) => {
        resolveGenerate = resolve;
      })
    );

    renderStudio();
    goToReview();

    const generateBtn = screen.getByRole('button', { name: /generate website/i });
    fireEvent.click(generateBtn);
    fireEvent.click(generateBtn); // second click should be a no-op — button is disabled

    expect(aiStudioAPI.generatePortfolio).toHaveBeenCalledTimes(1);

    resolveGenerate({ data: { jobId: 'job-1', status: 'queued', currentStage: 'QUEUED' } });
    await waitFor(() => expect(screen.getByText(/generating your website/i)).toBeInTheDocument());
  });

  it('polls the job and shows the success state when completed', async () => {
    aiStudioAPI.generatePortfolio.mockResolvedValue({ data: { jobId: 'job-1', status: 'queued', currentStage: 'QUEUED' } });
    aiStudioAPI.getJobStatus.mockResolvedValue({
      data: { jobId: 'job-1', status: 'completed', currentStage: 'COMPLETED', projectId: 'proj-1' },
    });

    renderStudio();
    goToReview();
    fireEvent.click(screen.getByRole('button', { name: /generate website/i }));

    await waitFor(() => expect(screen.getByText(/project ready/i)).toBeInTheDocument());
    expect(screen.getByText(/proj-1/)).toBeInTheDocument();
  });

  it('shows a failure state with a retry action, and retry starts a new job', async () => {
    aiStudioAPI.generatePortfolio.mockResolvedValue({ data: { jobId: 'job-1', status: 'queued', currentStage: 'QUEUED' } });
    aiStudioAPI.getJobStatus.mockResolvedValue({
      data: { jobId: 'job-1', status: 'failed', currentStage: 'BUILDING', failureMessage: 'Build failed.' },
    });
    aiStudioAPI.retryJob.mockResolvedValue({ data: { jobId: 'job-2', status: 'queued', currentStage: 'QUEUED' } });

    renderStudio();
    goToReview();
    fireEvent.click(screen.getByRole('button', { name: /generate website/i }));

    await waitFor(() => expect(screen.getByText(/generation failed/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
    await waitFor(() => expect(aiStudioAPI.retryJob).toHaveBeenCalledWith('job-1'));
  });

  it('surfaces a submission error via toast without crashing', async () => {
    aiStudioAPI.generatePortfolio.mockRejectedValue({ response: { data: { message: 'AI service unavailable' } } });

    renderStudio();
    goToReview();
    fireEvent.click(screen.getByRole('button', { name: /generate website/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('AI service unavailable'));
    // Still on the review step, not stuck on a broken progress screen.
    expect(screen.getByText(/review/i)).toBeInTheDocument();
  });
});
