'use strict';
const Airtable = require('airtable');

async function fetchAirtableRecords() {
  try {
    // Get Airtable Base
    const base = new Airtable({apiKey: process.env.AIRTABLE_API_KEY}).base(process.env.AIRTABLE_BASE_ID);
    
    // Get Podcast Record
    let podcastRecord = await base('Podcast').select({maxRecords: 1}).all()[0];

    // Get All Episode Records
    let episodeRecords = [];
    await base('Episodes').select({
      sort: [
        {field: "Season", direction: "desc"},
        {field: "Episode", direction: "desc"}
      ],
      maxRecords: 100,
      filterByFormula: `DATETIME_DIFF(NOW(),pubDate,'minutes')>0`
    }).eachPage(function page(records, fetchNextPage) {
        episodeRecords = episodeRecords.concat(records);
        // Get more than 100 records
        fetchNextPage();
    }, function done(err) {
        if (err) { console.error('Episode Query Error'); console.error(err); return; }
    });

    // Get All Categories
    const categoryRecords = await base('iTunes Categories').select({ maxRecords: 100 }).all();

    // Get All SubCategories
    const subcategoryRecords = await base('iTunes Subcategories').select({ maxRecords: 100 }).all();

    return {
      podcast: podcastRecord,
      episodes: episodeRecords,
      categories: categoryRecords,
      subcategories: subcategoryRecords,
    };
  } catch (err) {
    console.log(err);
  }
}

module.exports.feed = async event => {
  // Fetch all Records
  const {
    podcast,
    episodes,
    categories,
    subcategories
  } = await fetchAirtableRecords();

  const body = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0"
       xmlns:content="http://purl.org/rss/1.0/modules/content/"
       xmlns:wfw="http://wellformedweb.org/CommentAPI/"
       xmlns:dc="http://purl.org/dc/elements/1.1/"
       xmlns:atom="http://www.w3.org/2005/Atom"
       xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
       xmlns:spotify="http://www.spotify.com/ns/rss"
       xmlns:media="http://search.yahoo.com/mrss/">
  
  <channel>
      <title>${podcast.fields['<title>']}</title>
      <atom:link href="${podcast.fields['<atom:link>']}" rel="self" type="application/rss+xml"/>
      <link>${podcast.fields['<link>']}</link>
      <description>${podcast.fields['<description>']}</description>
      <language>${podcast.fields['<description>']}</language>
      <spotify:countryOfOrigin>us</spotify:countryOfOrigin>
      <copyright>${podcast.fields['<copyright>']}</copyright>
      <ttl>1440</ttl>
      <itunes:type>${podcast.fields['<itunes:type>']}</itunes:type>
      <itunes:author>${podcast.fields['itunes:author']}</itunes:author>
      <itunes:owner>
          <itunes:name>${podcast.fields['<itunes:author>']}</itunes:name>
          <itunes:email>${podcast.fields['<itunes:email>']}</itunes:email>
      </itunes:owner>
      <itunes:block>${podcast.fields['<itunes:block>']}</itunes:block>
      <itunes:explicit>${podcast.fields['<itunes:explicit>']}</itunes:explicit>
      <itunes:image href="${podcast.fields['<itunes:image>']}" />
  </channel>
  </rss>
  `;
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body
  };
};
