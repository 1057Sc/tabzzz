# Privacy Policy

TabZZZ is designed to reduce Chrome tab memory pressure while keeping browsing data local.

## Data Stored Locally

TabZZZ may store the following data in Chrome extension storage:

- extension settings
- never-sleep site rules
- tab activity timestamps
- lightweight tab metadata used for local memory-pressure estimates
- local memory history used by the side panel dashboard

This data is stored on the user's device through Chrome extension storage.

## Data Sent to Remote Servers

The current public build does not send browsing data, tab URLs, tab titles, settings, or memory history to a remote server.

TabZZZ does not use analytics in the current public build.

## Webpage Access

The current public build does not inject content scripts into webpages.

## Permissions

TabZZZ requests Chrome extension permissions only for its tab-management workflow:

- `tabs`
- `tabGroups`
- `storage`
- `alarms`
- `system.memory`
- `sidePanel`

These permissions are used to read tab metadata, estimate memory pressure, sleep or wake tabs through Chrome's native APIs, protect grouped tabs, store local settings, and show the native side panel UI.

## Contact

For questions or issues, open a GitHub issue in the project repository.
