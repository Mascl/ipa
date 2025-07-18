# CompSuite API connection through Vercel

## Endpoints
* Seasons

The current season is selected by being the most recent one

## Blobs
* Groups: lists groups with their ID _(through CompSuite API call)_
* Events-with-groups _(through CompSuite API call + scraping)_

## Scraping
Through blob, we scrape:
* The current season once per day at 4am UTC: `"schedule": "0 4 * * *"`
* The past seasons once per month at 4:15 am UTC: `"schedule": "15 4 1 * *"`

### Sample data on all-seasons.js
_To do: add real event data structure_
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
]```