import React, { useMemo, useState } from 'react';
import { parseUrlPreview, type UrlPreviewInfo } from '../lib/urlPreview';
import { Globe } from 'lucide-react';

interface LinkPreviewCardProps {
  url: string;
  compact?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({
  url,
  compact = false,
  onClick,
}) => {
  const info: UrlPreviewInfo = useMemo(() => parseUrlPreview(url), [url]);
  const [faviconFailed, setFaviconFailed] = useState(false);

  const domain = info.domain || 'link';
  const displayUrl = info.cleanUrl.replace(/^https?:\/\//, '');

  const rawTitle = info.title?.trim();
  const hasDistinctTitle = Boolean(
    rawTitle &&
    rawTitle.toLowerCase() !== displayUrl.toLowerCase() &&
    rawTitle.toLowerCase() !== domain.toLowerCase()
  );
  const displayTitle = hasDistinctTitle ? rawTitle : displayUrl;

  const faviconUrl = domain && !faviconFailed && domain !== 'link'
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
    : null;

  return (
    <div
      className={`link-card${compact ? ' compact' : ''}`}
      onClick={onClick}
    >
      <div className="link-card-top">
        {faviconUrl ? (
          <img
            src={faviconUrl}
            alt=""
            className="w-3.5 h-3.5 rounded-sm object-contain shrink-0"
            onError={() => setFaviconFailed(true)}
            loading="lazy"
          />
        ) : (
          <Globe className="w-3.5 h-3.5 link-card-icon" />
        )}
        <span className="link-card-domain">{domain}</span>
      </div>

      <div className="link-card-body" title={info.cleanUrl}>
        {displayTitle}
      </div>

      {hasDistinctTitle && (
        <div className="link-card-url" title={info.cleanUrl}>
          {displayUrl}
        </div>
      )}
    </div>
  );
};

export default LinkPreviewCard;
