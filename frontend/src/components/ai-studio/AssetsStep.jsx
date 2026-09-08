import React, { useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import StepShell from './StepShell';
import { aiStudioAPI } from '../../api/ai';
import { ASSET_TYPES } from '../../config/aiStudio.config';

const MAX_SIZE_BYTES = 8 * 1024 * 1024;
const ACCEPT_BY_TYPE = {
  [ASSET_TYPES.PROFILE_IMAGE]: 'image/jpeg,image/png,image/webp',
  [ASSET_TYPES.PROJECT_IMAGE]: 'image/jpeg,image/png,image/webp',
  [ASSET_TYPES.RESUME]: 'application/pdf',
};

function UploadSlot({ label, type, icon: Icon, asset, uploading, onUpload, onRemove }) {
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_SIZE_BYTES) {
      toast.error(`${file.name} is over the 8MB limit.`);
      return;
    }
    onUpload(file, type);
  };

  return (
    <div className="rounded-[22px] border border-white/8 bg-[#0b0b0b] p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
          <Icon size={16} className="text-[#8b7355]" />
        </div>
        <p className="text-[14px] font-semibold">{label}</p>
      </div>

      {asset ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/10">
          <span className="text-xs text-white/60 truncate">{asset.name}</span>
          <button type="button" onClick={() => onRemove(type)} aria-label={`Remove ${label}`} className="text-white/30 hover:text-red-400 shrink-0">
            <Trash2 size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/15 text-xs font-bold text-white/50 hover:text-white hover:border-white/30 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      )}
      <input ref={inputRef} type="file" className="hidden" accept={ACCEPT_BY_TYPE[type]} onChange={handleFile} />
    </div>
  );
}

export default function AssetsStep({ assets, onChange, onBack, onNext }) {
  const [uploadingType, setUploadingType] = useState(null);

  const handleUpload = async (file, type) => {
    setUploadingType(type);
    try {
      const res = await aiStudioAPI.uploadAsset(file, type);
      const uploaded = res.data.asset;

      if (type === ASSET_TYPES.PROJECT_IMAGE) {
        onChange({ ...assets, projectImages: [...assets.projectImages, uploaded] });
      } else {
        onChange({ ...assets, [type === ASSET_TYPES.PROFILE_IMAGE ? 'profileImage' : 'resume']: uploaded });
      }
      toast.success(`${file.name} uploaded.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setUploadingType(null);
    }
  };

  const removeAsset = (type) => {
    if (type === ASSET_TYPES.PROFILE_IMAGE) onChange({ ...assets, profileImage: null });
    if (type === ASSET_TYPES.RESUME) onChange({ ...assets, resume: null });
  };

  const removeProjectImage = (index) =>
    onChange({ ...assets, projectImages: assets.projectImages.filter((_, i) => i !== index) });

  const totalUploaded = (assets.profileImage ? 1 : 0) + (assets.resume ? 1 : 0) + assets.projectImages.length;

  return (
    <StepShell stepIndex={2} title="Upload assets" subtitle="Optional — you can skip this and add images later.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UploadSlot
          label="Profile image"
          type={ASSET_TYPES.PROFILE_IMAGE}
          icon={ImageIcon}
          asset={assets.profileImage}
          uploading={uploadingType === ASSET_TYPES.PROFILE_IMAGE}
          onUpload={handleUpload}
          onRemove={removeAsset}
        />
        <UploadSlot
          label="Resume (PDF)"
          type={ASSET_TYPES.RESUME}
          icon={FileText}
          asset={assets.resume}
          uploading={uploadingType === ASSET_TYPES.RESUME}
          onUpload={handleUpload}
          onRemove={removeAsset}
        />
      </div>

      <div className="mt-4 rounded-[22px] border border-white/8 bg-[#0b0b0b] p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <ImageIcon size={16} className="text-[#8b7355]" />
          </div>
          <p className="text-[14px] font-semibold">Project images</p>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {assets.projectImages.map((img, i) => (
            <span key={img.path || i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs">
              {img.name}
              <button type="button" onClick={() => removeProjectImage(i)} aria-label={`Remove ${img.name}`} className="text-white/30 hover:text-red-400">
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
        <UploadSlot
          label=""
          type={ASSET_TYPES.PROJECT_IMAGE}
          icon={UploadCloud}
          asset={null}
          uploading={uploadingType === ASSET_TYPES.PROJECT_IMAGE}
          onUpload={handleUpload}
          onRemove={() => {}}
        />
      </div>

      <p className="text-white/25 text-xs mt-4">{totalUploaded} asset{totalUploaded === 1 ? '' : 's'} uploaded.</p>

      <div className="flex gap-3 mt-6">
        <button type="button" onClick={onBack} className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-[13px] font-bold">
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={uploadingType !== null}
          className="flex-1 sm:flex-none px-8 py-3 rounded-xl bg-white text-black text-[13px] font-bold tracking-wide disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </StepShell>
  );
}
