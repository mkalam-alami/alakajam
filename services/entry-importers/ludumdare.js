'use strict'

/**
 * ludumdare.com entry importer
 *
 * @module services/entry-importers/ludumdare
 */

const download = require('download')
const cheerio = require('cheerio')
const log = require('../../core/log')
const forms = require('../../core/forms')
const entryImporterTools = require('./entry-importer-tools')

module.exports = {
  config: {
    id: 'ludumdare.com',
    title: 'Ludum Dare legacy site (ludumdare.com)',
    mode: 'scraping'
  },
  fetchEntryReferences,
  fetchEntryDetails
}

async function fetchEntryReferences (profileIdentifier) {
  let profileName
  if (profileIdentifier.includes('://')) {
    profileName = profileIdentifier.replace(/\/$/, '').replace(/^.*\//, '')
  } else {
    profileName = profileIdentifier
  }

  // Download page
  let downloadUrl = `http://ludumdare.com/compo/author/${profileName}/`
  let rawPage
  try {
    rawPage = await download(downloadUrl)
  } catch (e) {
    log.warn('Failed to download ' + downloadUrl)
    console.log(e)
    return []
  }
  let $ = cheerio.load(rawPage.toString())

  let entryReferences = []
  $('#compo2 td a').each(function (i, elem) {
    // Fetch info
    let thumbnail = $('img', elem).attr('src')
    let title = $(elem).text()
    let link = $(elem).attr('href').replace('../../', 'http://ludumdare.com/compo/')
    let eventId = $(elem).attr('href').replace('../../', '').replace(/\/.*/, '')
    let externalEvent = entryImporterTools.capitalizeAllWords(eventId.replace(/-/g, ' ')).replace('Minild', 'MiniLD')

    // Sanitize & store info
    entryReferences.push({
      id: 'ludumdare-' + profileName + '-' + forms.sanitizeString(eventId),
      title: forms.sanitizeString(title),
      link: forms.isURL(link) ? link : null,
      thumbnail: forms.isURL(thumbnail) ? thumbnail : null,
      importerProperties: {
        externalEvent: forms.sanitizeString(externalEvent)
      }
    })
  })

  return entryReferences
}

async function fetchEntryDetails (entryReference) {
  let rawPage = await download(entryReference.link)
  let $ = cheerio.load(rawPage.toString())

  // Grab author info to make sure we're on a working entry page
  let authorLink = $('#compo2 a strong')
  if (authorLink.text()) {
    // Fetch detailed info
    let picture = $('#shotview img').attr('src')
    let body = $($('#compo2 h2').get(1)).prev().text()
    let linksText = ''
    let links = $('#compo2 .links a').map((i, link) => {
      let $link = $(link)
      linksText += $link.text().toLowerCase() + ' '
      return {
        label: $link.text(),
        url: $link.attr('href')
      }
    }).get()

    // Prepare links (with an additional to ludumdare.com)
    links = links.map(link => ({
      label: forms.sanitizeString(link.label),
      url: forms.isURL(link.url) ? link.url : null
    }))
    links.push({
      label: 'Ludum Dare entry page',
      url: entryReference.link
    })

    // Sanitize & store
    let entryDetails = {
      title: entryReference.title,
      externalEvent: entryReference.importerProperties.externalEvent,
      picture: forms.isURL(picture) ? picture : null,
      body: forms.sanitizeString(body, 100000),
      platforms: entryImporterTools.guessPlatforms(linksText),
      links
    }

    return entryDetails
  }

  return { error: 'Entry page seems empty' }
}
