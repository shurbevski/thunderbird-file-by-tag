# File by Tag — Thunderbird add-on

Files each selected message into the folder whose path matches its tag name.

| Message has…                         | What happens                                              |
|--------------------------------------|-----------------------------------------------------------|
| one tag matching a folder            | moved to that folder                                      |
| nested tags (`System` + `System/Logs`) | only the innermost counts → moved to System/Logs        |
| several unrelated/sibling tags (`System/Logs/Servers` + `System/Logs/Devices`) | copied to all but the last, moved to the last (Settings → Tags order) |
| no tags, or only built-in tags (Important, Work, …) | normal Archive                             |
| a custom tag with no matching folder | left in place, with a notification                        |
| already in one of its tag folders    | copied to the other tag folders, left where it is         |

Tag name `Announcements/Chourei` ↔ folder `Announcements/Chourei` in the same account (exact match, case-sensitive).
Moves and copies can be undone with Ctrl+Z.

## Using it
- **Ctrl+Shift+A**, or
- the **File by tag** toolbar button (right-click the toolbar → Customize… to place it), or
- right-click selected messages → **File by tag**, or
- the button in the header of an opened message.

> Ctrl+Shift+A is also Thunderbird's own "Add-ons and Themes" shortcut. If the Add-ons Manager opens instead,
> go to Add-ons Manager → gear icon → **Manage Extension Shortcuts** and set another key.

## Installing
Add-ons Manager (Tools → Add-ons and Themes) → gear icon → **Install Add-on From File…** → `file-by-tag-1.1.0.xpi`.

For testing changes without reinstalling: gear icon → **Debug Add-ons** → **Load Temporary Add-on…** → pick `manifest.json`
(removed when Thunderbird restarts).

## Filters
With the add-on, the "Move - …" filters aren't needed: use `msgFilterRules-tag-only.dat`
(special filters + "Tag - …" filters only). Quit Thunderbird, back up the old file in
`ImapMail/mail.kcg.ac.jp/`, put the new one in its place as `msgFilterRules.dat`.

## Publishing on addons.thunderbird.net (ATN)
1. Sign in at https://addons.thunderbird.net (top-right), then **Tools → Submit a New Add-on**.
2. Choose **On this site** (public listing) or **On your own** (unlisted, only you distribute it).
3. Upload the `.xpi`. The code is plain, unminified JavaScript, so no separate source upload is needed.
4. Fill in the listing: summary, description, a category (pick the one about folders/filters), screenshots, licence (MIT or MPL-2.0 are common), and a support e-mail or URL.
5. Submit. Simple add-ons may be approved automatically; others wait for a volunteer reviewer, which can take weeks.

For updates, raise `version` in `manifest.json`, re-zip, and upload a new version of the same add-on.
Keep the `id` (`file-by-tag@shurbevski`) unchanged forever — it is how ATN and Thunderbird recognise the add-on.
Before a public release you might rename it so the name doesn't sound like a built-in feature, and add a short options page if you want the tag→folder rule to be configurable for other users.
