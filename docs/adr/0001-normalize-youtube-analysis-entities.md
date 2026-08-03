# Normalize YouTube analysis entities

The YouTube analysis will represent Videos, Watch Events, Channels, Classifications, and Manual Overrides separately instead of continuing to duplicate video-level metadata and scores on every history row. This adds migration work now, but it gives each concept one stable identity, preserves scorer history, and prevents repeated watch events from drifting to different metadata or scores.
