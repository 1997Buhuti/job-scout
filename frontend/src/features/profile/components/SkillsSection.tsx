'use client';

interface SkillsSectionProps {
  skills: string[];
  onAddSkill: (skill: string) => void;
  onRemoveSkill: (skill: string) => void;
  isAddingSkill: boolean;
  newSkillInput: string;
  onNewSkillChange: (value: string) => void;
  onAddSkillSubmit: () => void;
}

export function SkillsSection({
  skills,
  onAddSkill,
  onRemoveSkill,
  isAddingSkill,
  newSkillInput,
  onNewSkillChange,
  onAddSkillSubmit,
}: SkillsSectionProps) {
  const handleAddSkill = () => {
    if (newSkillInput.trim()) {
      onAddSkill(newSkillInput.trim());
      onNewSkillChange('');
      onAddSkillSubmit();
    }
  };

  return (
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
        {skills.length === 0 ? (
          <span className="text-xs text-outline-variant">No skills detected</span>
        ) : (
          skills.map((skill) => (
            <span
              key={skill}
              className="group flex items-center gap-1.5 rounded-full border border-outline-variant/30 bg-surface-container px-3 py-1 text-xs text-on-surface transition-colors hover:border-secondary/50"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
              {skill}
              <button
                type="button"
                onClick={() => onRemoveSkill(skill)}
                className="ml-1 hidden text-outline hover:text-error group-hover:inline-block"
                title="Remove skill"
              >
                ×
              </button>
            </span>
          ))
        )}

        {isAddingSkill ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newSkillInput}
              onChange={(e) => onNewSkillChange(e.target.value)}
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
            onClick={() => onAddSkillSubmit()}
            className="flex items-center gap-1 rounded-full border border-dashed border-outline-variant/50 px-3 py-1 text-xs text-outline hover:border-secondary hover:text-secondary transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            Add Skill
          </button>
        )}
      </div>
    </div>
  );
}
