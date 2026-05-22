# Changelog

## 1.2.0 - Native side panel experience

- Reworked TabZZZ around Chrome's native side panel.
- Removed page-level sidebar/content-script injection from the current public build.
- Added toolbar badge support for sleeping tab counts.
- Added batch close for already sleeping tabs with same-button confirmation.
- Protected pinned tabs and grouped tabs from automatic sleep.
- Added default never-sleep rules for local development hosts and common AI assistant sites.
- Added configurable forgotten-tab threshold.
- Added Sidebar mode setting so TabZZZ can open in Chrome's side panel or as a toolbar popup.
- Improved side panel state sync with debounced tab and tab-group events while the panel is open.
- Updated public README, license metadata, and extension icons.

## 1.1.0 - Auto memory mode

- Added automatic memory-pressure based tab sleeping.
- Added conservative rules for activity, audible tabs, protected sites, and extension/system pages.
- Improved background polling to reduce idle extension work.

## 1.0.0 - Low-power baseline

- Established the low-power baseline for native tab discard.
- Documented the product direction and review plan.
