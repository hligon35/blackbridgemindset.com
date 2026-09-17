import React from 'react';

export default function AdminCarouselNav({ items, activeId, onChange }) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];

  return (
    <div className="admin-tab-nav-wrap">
      <div
        className="admin-tab-nav"
        role="tablist"
        aria-label="Admin sections"
      >
        {safeItems.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              className={`admin-tab-button${isActive ? ' is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-bbm-tour={`admin-tab-${item.id}`}
              onClick={() => onChange(item.id)}
              disabled={isActive}
              title={item.description || item.label}
            >
              {item.label}
            </button>
          );
        })}
      </div>

    </div>
  );
}
