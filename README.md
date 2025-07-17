## Scraping
Through blob, we scrape:
* The current season once per day at 4am UTC: `"schedule": "0 4 * * *"`
* The past seasons once per month at 4 am UTC: `"schedule": "0 4 1 * *"`