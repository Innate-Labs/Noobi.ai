import React, { useEffect, useState } from 'react';

import type { ProjectRecord } from '../../shared/contracts';

const iconCache = new Map<string, string>();

function cacheKey(project: ProjectRecord): string | null {
  return project.icon ? `${project.id}:${project.icon.updatedAt}` : null;
}

/**
 * Renders the host-generated pixel icon for a project. Resolves to null while
 * the icon is loading (or missing) so callers can layer their own fallback.
 */
export function ProjectIconImage({
  project,
  className,
}: {
  project: ProjectRecord;
  className?: string;
}) {
  const key = cacheKey(project);
  const [loaded, setLoaded] = useState(() => ({
    key,
    url: key ? iconCache.get(key) ?? '' : '',
  }));
  const url = loaded.key === key ? loaded.url : '';

  useEffect(() => {
    if (!key) {
      setLoaded({ key: null, url: '' });
      return undefined;
    }
    const cached = iconCache.get(key);
    if (cached) {
      setLoaded({ key, url: cached });
      return undefined;
    }
    setLoaded({ key, url: '' });
    let alive = true;
    window.noobi
      .getProjectIcon(project.id)
      .then((data) => {
        if (!alive || !data) return;
        iconCache.set(key, data.dataUrl);
        setLoaded({ key, url: data.dataUrl });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key, project.id]);

  if (!key || !url) {
    return (
      <span className={`${className ?? ''} project-icon-fallback`.trim()} aria-hidden="true">
        {project.name.trim().slice(0, 1).toUpperCase() || 'N'}
      </span>
    );
  }
  return <img className={className} src={url} alt="" draggable={false} />;
}
