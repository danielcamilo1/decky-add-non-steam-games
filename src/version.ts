/**
 * The frontend's build number, shown next to the plugin's title.
 *
 * Keep in sync with `package.json` and `PLUGIN_VERSION` in `main.py`. The panel
 * compares this against what the backend reports, since a half-installed zip
 * leaves the two disagreeing and every symptom after that is confusing.
 */
export const PLUGIN_VERSION = "1.7.14";
