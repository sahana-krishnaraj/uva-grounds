## Edge Functions

### `delete-account`

Deletes the currently authenticated user from Supabase Auth.

- Endpoint name: `delete-account`
- Method: `POST`
- Expected JSON body:

```json
{ "confirmDelete": true }
```

Because user-linked rows use `on delete cascade` foreign keys to `auth.users`, deleting the auth user removes related app data automatically.

### Deploy

From project root:

```bash
supabase functions deploy delete-account
```

Then call from client:

```js
await supabase.functions.invoke("delete-account", { body: { confirmDelete: true } });
```
