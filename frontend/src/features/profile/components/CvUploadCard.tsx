'use client';

import { useCallback, useState } from 'react';

import { useUserProfile } from '@/features/profile/context/UserProfileContext';
import { uploadAndParseCv } from '@/lib/api/cvService';

import { CvUploadDropzone, type CvUploadResult } from './CvUploadDropzone';

const initialSkills = [
  { name: 'TypeScript', highlighted: true },
  { name: 'AWS', highlighted: true },
  { name: 'Next.js', highlighted: true },
  { name: 'Python', highlighted: true },
  { name: 'Serverless', highlighted: true },
  { name: 'DynamoDB', highlighted: true },
  { name: 'React', highlighted: false },
  { name: 'Node.js', highlighted: false },
  { name: 'Docker', highlighted: false },
  { name: 'Kubernetes', highlighted: false },
  { name: 'GraphQL', highlighted: false },
  { name: 'Terraform', highlighted: false },
  { name: 'PostgreSQL', highlighted: false },
  { name: 'CI/CD', highlighted: false },
];

export function CvUploadCard() {
  const { refresh } = useUserProfile();
  const [skills, setSkills] = useState(initialSkills);
  const [newSkillInput, setNewSkillInput] = useState('');
  const [isAddingSkill, setIsAddingSkill] = useState(false);

  const handleUpload = useCallback(
    async (file: File): Promise<CvUploadResult> => {
      // POST /cv/presign → PUT to S3 → POST /cv/parse (persists cvS3Key).
      const result = await uploadAndParseCv(file);
      await refresh(true);
      return { charCount: result.charCount };
    },
    [refresh],
  );

  const handleAddSkill = () => {
    if (newSkillInput.trim()) {
      setSkills([...skills, { name: newSkillInput.trim(), highlighted: false }]);
      setNewSkillInput('');
      setIsAddingSkill(false);
    }
  };

  const handleRemoveSkill = (skillName: string) => {
    setSkills(skills.filter((s) => s.name !== skillName));
  };

  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-6">
      <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-secondary/5 blur-3xl" />

      {/* Card Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary">
            description
          </span>
          <h2 className="text-lg font-medium text-on-surface">Master Resume (PDF)</h2>
        </div>
        <span className="rounded bg-secondary/10 px-2 py-0.5 font-mono text-[11px] text-secondary">
          S3 Presigned Active
        </span>
      </div>

      {/* Dropzone */}
      <CvUploadDropzone onUpload={handleUpload} />

      {/* Parsed Skills Matrix */}
      <div className="mt-6 border-t border-surface-container pt-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-outline">
            {skills.length} SKILLS DETECTED & INDEXED
          </span>
          <span className="font-mono text-[11px] font-medium text-secondary">
            Match Accuracy: 98.4%
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span
              key={skill.name}
              className="group flex items-center gap-1.5 rounded-full border border-outline-variant/30 bg-surface-container px-3 py-1 text-xs text-on-surface transition-colors hover:border-secondary/50"
            >
              {skill.highlighted && (
                <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
              )}
              {skill.name}
              <button
                type="button"
                onClick={() => handleRemoveSkill(skill.name)}
                className="ml-1 hidden text-outline hover:text-error group-hover:inline-block"
                title="Remove skill"
              >
                ×
              </button>
            </span>
          ))}

          {isAddingSkill ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSkill()}
                placeholder="Skill name..."
                autoFocus
                className="rounded-full border border-secondary bg-surface-container px-3 py-1 text-xs text-on-surface outline-none"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-on-secondary"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingSkill(true)}
              className="flex items-center gap-1 rounded-full border border-dashed border-outline-variant/50 px-3 py-1 text-xs text-outline hover:border-secondary hover:text-secondary transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              Add Skill
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
