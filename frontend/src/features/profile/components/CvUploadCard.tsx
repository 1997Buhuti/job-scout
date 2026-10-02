'use client';

import { useState, useRef, ChangeEvent, DragEvent } from 'react';

interface ResumeFile {
  name: string;
  size: string;
  parsed: boolean;
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<ResumeFile | null>({
    name: 'Software_Engineer_CV_2025.pdf',
    size: '2.4 MB',
    parsed: true,
  });
  const [skills, setSkills] = useState(initialSkills);
  const [newSkillInput, setNewSkillInput] = useState('');
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      const sizeMb = (selected.size / (1024 * 1024)).toFixed(1);
      setFile({
        name: selected.name,
        size: `${sizeMb} MB`,
        parsed: true,
      });
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      const sizeMb = (selected.size / (1024 * 1024)).toFixed(1);
      setFile({
        name: selected.name,
        size: `${sizeMb} MB`,
        parsed: true,
      });
    }
  };

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

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.doc,.docx"
        className="hidden"
      />

      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`mb-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-secondary bg-surface-container/80'
            : 'border-outline-variant/40 bg-surface-container/40 hover:border-secondary'
        }`}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
          <span className="material-symbols-outlined text-[24px]">
            upload_file
          </span>
        </div>
        <div className="mb-1 text-base font-medium text-on-surface">
          Drag & drop your updated resume here
        </div>
        <div className="mb-4 text-xs text-outline">
          Supports PDF up to 25MB. Automatically parsed via AWS Textract & Claude 3.5.
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="rounded-lg bg-surface-container-high px-4 py-2 text-xs font-medium text-on-surface hover:bg-surface-bright transition-colors"
        >
          Browse Files
        </button>
      </div>

      {/* Uploaded File Details */}
      {file && (
        <div className="flex items-center gap-3 rounded-xl bg-surface-container p-3 sm:p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-error-container/30 text-error">
            <span className="material-symbols-outlined text-[20px]">
              picture_as_pdf
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-on-surface">
              {file.name}
            </div>
            <div className="flex items-center gap-2 text-xs text-outline">
              <span>{file.size}</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-secondary">
                <span className="material-symbols-outlined text-[14px]">
                  verified
                </span>
                Parsed
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFile(null)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error-container/30 hover:text-error transition-colors"
            title="Remove uploaded CV"
          >
            <span className="material-symbols-outlined text-[18px]">
              delete
            </span>
          </button>
        </div>
      )}

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
