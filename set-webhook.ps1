param(
  [Parameter(Mandatory = $true)][string]$BotToken,
  [Parameter(Mandatory = $true)][string]$WorkerUrl,
  [Parameter(Mandatory = $true)][string]$Secret
)

$allowed = '["message","business_connection","business_message","edited_business_message","deleted_business_messages"]'
$body = @{
  url                  = $WorkerUrl
  secret_token         = $Secret
  allowed_updates      = $allowed
  drop_pending_updates = "true"
}
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$BotToken/setWebhook" -Body $body
Invoke-RestMethod -Uri "https://api.telegram.org/bot$BotToken/getWebhookInfo"
