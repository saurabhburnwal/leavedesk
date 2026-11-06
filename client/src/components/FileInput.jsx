import { useId, useRef, useState } from 'react';
import { usePolicy } from '../context.jsx';
import { formatBytes } from '../utils.js';

/**
 * Multi-file picker with client-side checks (type, size, count) and a removable list.
 * The server enforces the same limits.
 */
export function FileInput({ files, onChange, error, label = 'Supporting documents', required = false }) {
  const policy = usePolicy();
  const inputRef = useRef(null);
  const id = useId();
  const [localError, setLocalError] = useState('');

  function addFiles(list) {
    const incoming = Array.from(list);
    const problems = [];
    const accepted = [];
    for (const file of incoming) {
      const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
      if (!policy.allowedExtensions.includes(ext)) problems.push(`"${file.name}" is not a supported type.`);
      else if (file.size > policy.MAX_FILE_SIZE_MB * 1024 * 1024) problems.push(`"${file.name}" is larger than ${policy.MAX_FILE_SIZE_MB} MB.`);
      else if (!files.some((f) => f.name === file.name && f.size === file.size)) accepted.push(file);
    }
    let next = [...files, ...accepted];
    if (next.length > policy.MAX_FILES_PER_UPLOAD) {
      problems.push(`You can attach up to ${policy.MAX_FILES_PER_UPLOAD} files.`);
      next = next.slice(0, policy.MAX_FILES_PER_UPLOAD);
    }
    setLocalError(problems.join(' '));
    onChange(next);
    if (inputRef.current) inputRef.current.value = '';
  }

  const shownError = localError || error;

  return (
    <div className={`field ${shownError ? 'field-invalid' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required" aria-hidden="true"> *</span>}
      </label>
      <label
        className="dropzone"
        htmlFor={id}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        <span className="dropzone-icon" aria-hidden="true">
          📎
        </span>
        <span>
          <strong>Choose files</strong> or drag them here
        </span>
        <span className="muted small">
          {policy.allowedExtensions.join(', ').replaceAll('.', '').toUpperCase()} · up to {policy.MAX_FILE_SIZE_MB} MB each
        </span>
        <input
          ref={inputRef}
          id={id}
          type="file"
          multiple
          className="visually-hidden"
          accept={policy.allowedExtensions.join(',')}
          onChange={(e) => addFiles(e.target.files)}
        />
      </label>
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span className="file-name">📄 {file.name}</span>
              <span className="muted small">{formatBytes(file.size)}</span>
              <button type="button" className="icon-btn" aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((_, i) => i !== index))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {shownError && (
        <p className="field-error" role="alert">
          {shownError}
        </p>
      )}
    </div>
  );
}
