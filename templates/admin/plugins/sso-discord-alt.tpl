<div class="acp-page-container">
	<!-- IMPORT admin/partials/settings/header.tpl -->
  <div class="row m-0">
    <div id="spy-container" class="col-12 px-0 mb-4" tabindex="0">
      <div class="alert alert-info">
        <ol>
          <li>
            Create a <strong>Discord Application</strong> via the
            <a href="https://discordapp.com/developers/applications/me">API Console</a> and then paste
            your application details here.
          </li>
          <li>
            Ensure your application's redirect URI matches your NodeBB installation. For example, if your NodeBB lives at
            https://nodebb.example.com/, then you'd supply 'https://nodebb.example.com/auth/discord/callback' as the URI.
          </li>
          <li>
            You can configure this plugin via an <em>environment variables</em>. You can also specify values in the form below,
            and those will be stored in the database.
            <p>
              <pre><code>export SSO_DISCORD_CLIENT_ID="xxxxx"
  export SSO_DISCORD_CLIENT_SECRET="yyyyy"</code></pre>
            </p>
          </li>
        </ol>
      </div>
      <form role="form" class="sso-discord-alt-settings">
        <div class="form-group mb-3">
          <label for="discord_app_id">Client ID</label>
          <input type="text" id="discord_app_id" name="id" title="Client ID" class="form-control input-lg" placeholder="Client ID">
        </div>
        <div class="form-group mb-3">
          <label for="discord_secret">Secret</label>
          <input type="text" id="discord_secret" name="secret" title="Client Secret" class="form-control" placeholder="Client Secret">
        </div>
        <div class="form-check">
					<input type="checkbox" class="form-check-input" id="autoconfirm" name="autoconfirm" />
					<label for="autoconfirm" class="form-check-label">
						Skip email verification for people who register using SSO?
					</label>
				</div>
      </form>
    </div>
  </div>
</div>