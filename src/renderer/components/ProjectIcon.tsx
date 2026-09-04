import { useEffect, useState } from 'react';

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
  const [url, setUrl] = useState(() => (key ? iconCache.get(key) ?? '' : ''));

  useEffect(() => {
    if (!key) {
      setUrl('');
      return undefined;
    }
    const cached = iconCache.get(key);
    if (cached) {
      setUrl(cached);
      return undefined;
    }
    let alive = true;
    window.noobi
      .getProjectIcon(project.id)
      .then((data) => {
        if (!alive || !data) return;
        iconCache.set(key, data.dataUrl);
        setUrl(data.dataUrl);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key, project.id]);

  if (!key || !url) return null;
  return <img className={className} src={url} alt="" draggable={false} />;
}
