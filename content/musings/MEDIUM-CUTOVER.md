# Medium cutover

Deploy the website first. Open each new article URL and confirm that its text, images, and canonical URL are correct before changing Medium.

## Existing Medium posts

Keep the existing posts so their links, comments, and followers still have somewhere to go. For each post:

1. Open the Medium story and use its three-dot menu to enter the editor.
2. Open the editor's three-dot menu, choose **More settings**, then **Advanced Settings**.
3. Enable **This story was originally published elsewhere** and paste the corresponding website article URL from the table below.
4. Save the canonical URL, then publish the changes.
5. Inspect the published page source and confirm `rel="canonical"` points to that exact website article.

These are [Medium's canonical-link instructions](https://help.medium.com/hc/en-us/articles/360033930293-Set-a-canonical-link). Only the story's author can change this setting. For the coauthored essay, use the account that published it.

A canonical link does not redirect readers. Add a short linked note such as "Read the current version on my website" if you also want to send readers there. Update your Medium bio to point to [Musings](https://www.chappyasel.com/musings).

| Story | Existing Medium post | Website canonical URL |
| --- | --- | --- |
| The Self-Improving AI Stack: Five Layers Deep | [Medium post](https://medium.com/@chappyasel/the-self-improving-ai-stack-five-layers-deep-b6cff9ad0220) | https://www.chappyasel.com/musings/ai-stack |
| The Human Side of AI: 5 Lessons from America’s Top AI Hubs | [Medium post](https://medium.com/@chappyasel/the-human-side-of-ai-5-lessons-from-americas-top-ai-hubs-53e74b5ee399) | https://www.chappyasel.com/musings/human-side-of-ai |
| Top 10 Most Provoking Reads of 2024 | [Medium post](https://medium.com/@chappyasel/top-10-most-provoking-reads-of-2024-3dce650ed36c) | https://www.chappyasel.com/musings/reads-2024 |
| The End of Early Stage Venture | [Medium post](https://medium.com/@chappyasel/the-end-of-early-stage-venture-e61d68ab0d8c) | https://www.chappyasel.com/musings/early-stage-venture |
| The Apple Way | [Medium post](https://medium.com/@chappyasel/the-apple-way-013c1192be67) | https://www.chappyasel.com/musings/apple-way |
| AGI Manifesto Part I: Promise | [Medium post](https://medium.com/@chappyasel/agi-manifesto-promise-7fb056293f67) | https://www.chappyasel.com/musings/agi-promise |
| The GAI Collective: A Shared Curiosity | [Medium post](https://medium.com/@chappyasel/the-gai-collective-a-shared-curiosity-1640fac12ddd) | https://www.chappyasel.com/musings/shared-curiosity |
| America’s AI Ultimatum: Forge Ahead or Fall Behind | [Medium post](https://medium.com/@chappyasel/americas-ai-ultimatum-5552e27eeece) | https://www.chappyasel.com/musings/americas-ai-ultimatum |
| Can ChatGPT Generate a Full iOS App? | [Medium post](https://medium.com/@chappyasel/can-chatgpt-generate-a-full-ios-app-c1969c92c709) | https://www.chappyasel.com/musings/chatgpt-ios-app |
| From Nerd to Bodybuilder: Embracing Paradoxical Passions | [Medium post](https://medium.com/@chappyasel/from-nerd-to-bodybuilder-b9b13bb2d245) | https://www.chappyasel.com/musings/nerd-to-bodybuilder |

## Future posts

Write in the Notion Social Media Posts database. Set the slug, publication date, and summary, check **Musing**, and set **Status** to **Posted** when ready. Run `pnpm generate:blog-posts`, review locally, and deploy through the normal website release process. Notion edits do not go live until the snapshot is refreshed and deployed.

For an optional Medium copy, publish on the website first. In Medium, open **Stories**, choose **Import a story**, and paste the public article URL. Review the imported text and media before publishing. Medium's import tool automatically sets a canonical URL pointing back to the source. See [Medium's import instructions](https://help.medium.com/hc/en-us/articles/214550207-Importing-a-post-to-Medium).

The Trust essay remains hosted by The AI Collective. It has no Medium cutover step in this migration.
