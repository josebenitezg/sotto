# Managed Gmail connections

Sotto supports Composio's managed Gmail OAuth alongside direct Google OAuth. The interface stays the same: connect Google, then review the messages moved in Gmail. Classification calls OpenAI directly. The classifier cannot call Composio tools or access credentials.

## Configure an installation

1. Apply the database migrations, including `006_composio.sql`.
2. Create a Composio project and Gmail managed auth config. Request only Google profile, email, and `gmail.modify` where supported. If managed OAuth requires full Gmail access, obtain the user's informed consent before connecting. Do not request contacts or other unrelated scopes.
3. Set the project's request/response log storage to **Don't store data**. This is not a guarantee of zero provider retention.
4. Publish the application with `GMAIL_PROVIDER=google` initially. Verify that `/api/composio/callback` exists and rejects requests without a browser-bound connection attempt.
5. Set Composio's **OAuth user verification** URL to `https://YOUR_HOST/api/composio/callback`. This is required: Sotto deliberately rejects ordinary callback URLs containing only a connection ID. Never disable user verification as a workaround.
6. Create a V3 webhook subscription for `composio.trigger.message` pointing at `https://YOUR_HOST/api/composio/events`. Keep its signing secret private.
7. Set private server environment variables `COMPOSIO_API_KEY`, `COMPOSIO_AUTH_CONFIG_ID`, and `COMPOSIO_WEBHOOK_SECRET`, then set `GMAIL_PROVIDER=composio` and redeploy. The worker needs the same configuration. Keep `AI_PROVIDER=openai` and `OPENAI_API_KEY` for direct classification.
8. Connect an authorized pilot account through Sotto. Check initial processing, new-mail delivery, label changes, unread preservation, undo, pause, and disconnect before opening signup.

Do not put project keys, webhook secrets, or Google tokens in browser configuration. Never log provider response bodies, which may contain credentials or mail.

## Existing accounts

An existing account keeps using its current provider until reconnected. The verified Google identity links the replacement to its existing Sotto workspace, decisions, settings, and history cursor. A failed connection leaves the current account untouched. A newer pause is preserved if it happens during authorization. Old Composio connections are queued for revocation and deletion; failed cleanup is retried daily. Moving from direct Google to Composio does not automatically revoke the old Google application's grant; it can be removed separately in Google Account connections after migration.

## Delivery and limits

The managed Gmail trigger polls for Inbox messages, with an interval of 15 minutes. It is not an instant Google push hook. **Check now** and daily reconciliation provide additional recovery paths. Authenticated webhooks contain only routing identifiers in Sotto's database; workers fetch messages themselves.

Native Composio operations handle listing, history, profiles, and label changes. Raw message and thread reads use Composio's Google API proxy to preserve Gmail authentication headers, timestamps, and MIME structure. These have separate provider usage limits; monitor direct tool calls, proxy requests, trigger events, and OpenAI costs. The application does not automatically upgrade the Composio plan.

Managed OAuth does not, by itself, establish that every public product is exempt from Google's verification or security requirements. Confirm that the provider's terms and verification cover your use case before a public commercial launch. Keep public signup closed during the pilot.
