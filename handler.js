'use strict';
const Airtable = require('airtable');

let xml_special_to_escaped_one_map = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;'
};
function encodeXml(string) {
  if(!string){
    return '';
  }
  return string.toString().replace(/([\&"<>])/g, function(str, item) {
      return xml_special_to_escaped_one_map[item];
  });
};

async function fetchAirtableRecords() {
  try {
    // Get Airtable Base
    const base = new Airtable({apiKey: process.env.AIRTABLE_API_KEY}).base(process.env.AIRTABLE_BASE_ID);
    
    // Get Podcast Record
    let podcastRecords = await base('Podcast').select({maxRecords: 1}).all();

    // Get All Episode Records
    let episodeRecords = [];
    await base('Episodes').select({
      sort: [
        {field: "<itunes:season>", direction: "desc"},
        {field: "<itunes:episode>", direction: "desc"}
      ],
      maxRecords: 100,
      filterByFormula: `DATETIME_DIFF(NOW(),{<pubDate>},'minutes')>0`
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
      podcast: podcastRecords[0],
      episodes: episodeRecords,
      categories: categoryRecords,
      subcategories: subcategoryRecords,
    };
  } catch (err) {
    console.log(err);
  }
}

function episodeXML(episode) {
  return `
  <item>
    <title>${encodeXml(episode['<title>'])}</title>
    <itunes:title>${encodeXml(episode['<title>'])}</itunes:title>
    ${episode['<link>'] ? `<link>${encodeXml(episode['<link>'])}</link>` : ''}
    ${episode['<comments>'] ? `<comments>${encodeXml(episode['<comments>'])}</comments>` : ''}
    <pubDate>${encodeXml(new Date(episode['<pubDate>']).toUTCString())}</pubDate>
    <guid isPermaLink="false">${encodeXml(episode['<title>'])}</guid>
    <description><![CDATA[${encodeXml(episode['<description>'])}]]></description>
    <content:encoded><![CDATA[${encodeXml(episode['<description>'])}]]></content:encoded>           
    <enclosure url="${encodeXml(episode['<enclosure url>'])}" length="${encodeXml(episode['<enclosure length>'])}" type="${encodeXml(episode['<enclosure type>'])}"/>
    <itunes:summary>${encodeXml(episode['<description>'])}</itunes:summary>
    <itunes:author>${encodeXml(episode['<itunes:author>'])}</itunes:author>
    <itunes:explicit>${encodeXml(episode['<itunes:explicit>'])}</itunes:explicit>
    <itunes:block>${encodeXml(episode['<itunes:block>'])}</itunes:block>
    <itunes:duration>${encodeXml(episode['<itunes:duration>'])}</itunes:duration>
    <itunes:season>${encodeXml(episode['<itunes:season>'])}</itunes:season>
    <itunes:episode>${encodeXml(episode['<itunes:episode>'])}</itunes:episode>
    <itunes:episodeType>${encodeXml(episode['<itunes:episodeType>'])}</itunes:episodeType>
    <itunes:image href="${encodeXml(episode['<itunes:image>'])}" />
  </item>`;
}

function categoryXML(category,subcategory) {
  return `<itunes:category text="${encodeXml(category)}"><itunes:category text="${encodeXml(subcategory)}"/></itunes:category>`;
}

module.exports.feed = async event => {
  // Fetch all Records
  const {
    podcast,
    episodes,
    categories,
    subcategories
  } = await fetchAirtableRecords();

  // Format categories into XML
  const categoryItems = categories.map((category) => {
    // Find subcategory from ID
    const subcategory = subcategories.find((record) => record.id === category.fields['<itunes:subcategory>'][0]);
    return categoryXML(category.fields['<itunes:category>'], subcategory.fields['<itunes:subcategory>']);
  });

  // Format episodes into XML
  const episodeItems = episodes.map((episode) => {
    return episodeXML(episode.fields);
  });

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
      <language>${podcast.fields['<language>']}</language>
      <spotify:countryOfOrigin>us</spotify:countryOfOrigin>
      <copyright>${podcast.fields['<copyright>']}</copyright>
      <ttl>1440</ttl>
      <itunes:type>${podcast.fields['<itunes:type>']}</itunes:type>
      <itunes:author>${podcast.fields['<itunes:author>']}</itunes:author>
      <itunes:owner>
          <itunes:name>${podcast.fields['<itunes:author>']}</itunes:name>
          <itunes:email>${podcast.fields['<itunes:email>']}</itunes:email>
      </itunes:owner>
      <itunes:block>${podcast.fields['<itunes:block>']}</itunes:block>
      <itunes:explicit>${podcast.fields['<itunes:explicit>']}</itunes:explicit>
      <itunes:image href="${podcast.fields['<itunes:image>']}" />
      ${categoryItems.join('\n')}
      ${episodeItems.join('\n')}
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
