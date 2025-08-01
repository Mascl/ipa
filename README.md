# CompSuite API connection through Vercel
This repo connects Vercel to CompetitionSuite. The endpoints and blobs deliver data to Squarespace.

## Endpoints currently in use
* /api/divisions.js
* /api/groups.js → creates a list of groups with their info: location, division
* /api/groups-per-division → creates a list of groups per division
* /api/scrape-all-seasons.js → creates `all-seasons.json` blob of events with their registered groups & URLs (schedule, recap)
* /api/scrape-current-seasons.js → creates `current-seasons.json` blob like all-seasons but for most recent season


## Endpoints currently _not_ in use
* /api/season.js _(for scores.html)_
* /api/group-events.js _(replaced when we created the events-with-groups blob)_
* /api/scrape-events.js

The current season is selected by being the most recent one

## Blobs
* all-seasons.js _(through CompSuite API call + scraping)_
* current-season.js _(through CompSuite API call + scraping)_

## Scraping
Through blob, we scrape:
* The current season once per day at 4am UTC: `"schedule": "0 4 * * *"`
* The past seasons once per month at 4:15 am UTC: `"schedule": "15 4 1 * *"`

### Sample data on all-seasons.js
```[
  {
    "id": 14343,
    "name": "2026",
    "events": [
      //future event with schedule data to link to
      //schedulUrl extists but recapUrl doesn't
      {
        "id": 36755,
        "name": "Week 1",
        "scheduleUrl": "https://schedules.competitionsuite.com/8da87e46-cdf7-4b08-b4b0-b277088107bd_standard.htm",
        "recapUrl": "",
        "groups": [
          {
            "name": "Carroll High School Indoor Percussion",
            "class": "PSO",
            "groupId": 93181
          },
          {
            "name": "Fishers Indoor Drumline (PSO)",
            "class": "PSO",
            "groupId": 93182
          },
          {
            "name": "Avon High School",
            "class": "PSW",
            "groupId": 93183
          }
        ]
      },
      //future event that has been created, but has no data
      //no schedulUrl, no recapUrl
      {
        "id": 36756,
        "name": "Week 2",
        "scheduleUrl": null,
        "recapUrl": "",
        "error": "Request failed with status code 403"
      },
      //past event
      //has both a scheduleUrl and a recapUrl
      {
        "id": 33476,
        "name": "Week 1: Warren Central HS Invitational",
        "scheduleUrl": "https://schedules.competitionsuite.com/73f88055-d0cf-4fc6-833b-886a314e447b_standard.htm",
        "recapUrl": "https://recaps.competitionsuite.com/73f88055-d0cf-4fc6-833b-886a314e447b.htm",
        "groups": [
          {
            "name": "Owen Valley High School Winter Percussion",
            "class": "PRA",
            "groupId": 17134
          },
          {
            "name": "North Harrison Indoor Percussion",
            "class": "PRA",
            "groupId": 17187
          },
          {
            "name": "Terre Haute South Indoor Percussion",
            "class": "PRA",
            "groupId": 17120
          }
        ]
      },
    ]
  },
  {
    "id": 14342,
    "name": "2025",
    "events": []
  }
]
```

## Bridging CompSuite events to Squarespace events
This bridge is made via the `Source URL` field in the Squarespace event details.
1. Go to the Events collection in Squarespace
2. Click through to the individual event
3. Hover the three dots and click Settings
4. In the Content tab, scroll down to the Source URL 
5. Paste the __standard schedule URL__ here, _e.g. https://schedules.competitionsuite.com/73f88055-d0cf-4fc6-833b-886a314e447b_standard.htm_

Two instances rely on this bridge:
1. On the event detail page, feed the registered groups
2. On the group detail page, create the "View details" link
