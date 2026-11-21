# תיכון קשת - לוח מבחנים ואירועים

A public GitHub Pages companion for the Keshet High School agenda. The home page links to the separate schedules for Grades 10, 11, and 12.

GitHub Actions checks the school's published Google Sheets export every five minutes. It deploys when events or website code change. Each grade page requests its own generated schedule. The source link stays in the repository's `GOOGLE_SHEET_URL` Actions secret. The public repository contains the website code and import logic.

To deploy a fork, enable GitHub Actions in Settings → Pages and set the `GOOGLE_SHEET_URL` Actions secret. Set the optional `GOOGLE_SHEET_TAB` and `SCHOOL_YEAR_START` repository variables when the tab or school year changes. Run the publish workflow from Actions to check the first deployment. The recurring job is configured in `.github/workflows/publish.yml`.
