'use strict'

const User = require.main.require('./src/user')
const InternalOAuthError = require('passport-oauth').InternalOAuthError
const OAuth2Strategy = require('passport-oauth').OAuth2Strategy
const meta = require.main.require('./src/meta')
const db = require.main.require('./src/database')
const passport = require.main.require('passport')
const nconf = require.main.require('nconf')
const winston = require.main.require('winston')
const async = require.main.require('async')
const authenticationController = require.main.require('./src/controllers/authentication')
const quickFormat = require('quick-format')

function doLog () {
  const args = Array.from(arguments)
  const method = args.splice(0, 1)[0]
  const formatStr = '[sso-discord-alt] ' + args.splice(0, 1)[0]
  method.call(winston, quickFormat([formatStr].concat(args)))
}

function log () {
  doLog.apply(null, [winston.verbose].concat(Array.from(arguments)))
}

function logError () {
  doLog.apply(null, [winston.error].concat(Array.from(arguments)))
}

function logWarn () {
  doLog.apply(null, [winston.warn].concat(Array.from(arguments)))
}

const constants = Object.freeze({
  name: 'discord',
  displayName: 'Discord',
  admin: {
    route: '/plugins/sso-discord-alt',
    icon: 'fab fa-discord'
  },
  oauth: { // a passport-oauth2 options object
    authorizationURL: 'https://discord.com/api/v10/oauth2/authorize',
    tokenURL: 'https://discord.com/api/v10/oauth2/token',
    passReqToCallback: true
  },
  userRoute: 'https://discord.com/api/v10/users/@me'
})

const DiscordAuth = {}

/**
 * Invoked by NodeBB when initializing the plugin.
 *
 * @param {object} data Provides some context information.
 * @param {function} callback Invokec when initialization is complete.
 */
DiscordAuth.init = function (data, callback) {
  log('initializing')

  const hostHelpers = require.main.require('./src/routes/helpers')

  hostHelpers.setupAdminPageRoute(data.router, '/admin/plugins/sso-discord-alt', (req, res) => {
    log('rendering admin view')
    res.render('admin/plugins/sso-discord-alt', {
      title: constants.name,
      baseUrl: nconf.get('url')
    })
  })
  hostHelpers.setupPageRoute(data.router, `/deauth/${constants.name}`, data.middleware, [data.middleware.requireUser], function (_, res) {
    res.render('plugins/sso-discord-alt/deauth', {
      service: constants.displayName
    })
  })
  data.router.post(`/deauth/${constants.name}`, [data.middleware.requireUser, data.middleware.applyCSRF], function (req, res, next) {
    DiscordAuth.deleteUserData({ uid: req.user.uid }, function (err) {
      if (err) {
        return next(err)
      }

      res.redirect(nconf.get('relative_path') + '/me/edit')
    })
  })

  callback()
}

DiscordAuth.addMenuItem = function (customHeader, callback) {
  log('adding admin menu item')
  customHeader.authentication.push({
    route: constants.admin.route,
    icon: constants.admin.icon,
    name: constants.displayName
  })

  callback(null, customHeader)
}

DiscordAuth.getStrategy = function (strategies, callback) {
  log('adding authentication strategy')
  const options = constants.oauth
  options.callbackURL = nconf.get('url') + '/auth/' + constants.name + '/callback'

  meta.settings.get('sso-discord-alt', function (err, settings) {
    if (err) return callback(err)

    options.clientID = settings.id || process.env.SSO_DISCORD_CLIENT_ID || ''
    options.clientSecret = settings.secret || process.env.SSO_DISCORD_CLIENT_SECRET || ''

    if (!options.clientID || !options.clientSecret) {
      logWarn('Missing sso-discord-alt configuration. Not enabling authentication strategy.')
      return callback(null, strategies)
    }

    function PassportOAuth () {
      OAuth2Strategy.apply(this, arguments)
    }
    require('util').inherits(PassportOAuth, OAuth2Strategy)

    /**
     * Invoked by the OAuth2Strategy prior to the verify callback being invoked.
     *
     * @param {string} accessToken API access token as returned by the remote service.
     * @param {function} done Callback to be invoked when profile parsing is finished.
     */
    PassportOAuth.prototype.userProfile = function (accessToken, done) {
      log('getting user profile from remote service')
      this._oauth2._useAuthorizationHeaderForGET = true
      this._oauth2.get(constants.userRoute, accessToken, function (err, body, res) {
        if (err) return done(new InternalOAuthError('failed to fetch user profile', err))
        try {
          log('parsing remote profile information')
          const oauthUser = JSON.parse(body)
          done(null, { // user profile for verify function
            id: oauthUser.id,
            avatar: oauthUser.avatar ? `https://cdn.discordapp.com/avatars/${oauthUser.id}/${oauthUser.avatar}.png` : null,
            displayName: oauthUser.username,
            email: oauthUser.email,
            provider: constants.name
          })
        } catch (e) {
          done(e)
        }
      })
    }

    const authenticator = new PassportOAuth(options, function verify (req, token, secret, profile, done) {
      log('passport verify function invoked: %j', profile)
      if (req.user && req.user.uid && req.user.uid > 0) {
        User.setUserField(req.user.uid, constants.name + 'Id', profile.id)
        db.setObjectField(constants.name + 'Id:uid', profile.id, req.user.uid)

        return authenticationController.onSuccessfulLogin(req, req.user.uid, function (err) {
          done(err, !err ? req.user : null)
        })
      }

      DiscordAuth.login(profile, function (err, user) {
        if (err) return done(err)
        authenticationController.onSuccessfulLogin(req, user.uid, function (err) {
          done(err, !err ? user : null)
        })
      })
    })
    passport.use(constants.name, authenticator)

    strategies.push({
      name: constants.name,
      url: '/auth/' + constants.name,
      callbackURL: `/auth/${constants.name}/callback`,
      icon: constants.admin.icon,
      icons: {
        normal: 'fa-brands fa-discord',
        square: 'fa-brands fa-discord',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36"><defs><style>.cls-1{fill:#5865f2;}</style></defs><g id="图层_2" data-name="图层 2"><g id="Discord_Logos" data-name="Discord Logos"><g id="Discord_Logo_-_Large_-_White" data-name="Discord Logo - Large - White"><path class="cls-1" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></g></g></g></svg>'
      },
      labels: {
        login: 'Discord',
        register: 'Discord'
      },
      color: '#7289DA',
      scope: ['identify', 'email']
    })
    log('authentication strategy added')

    callback(null, strategies)
  })
}

DiscordAuth.getAssociation = function (data, callback) {
  log('determining if user is associated with discord')
  User.getUserField(data.uid, constants.name + 'Id', function (err, discordId) {
    if (err) return callback(err, data)

    if (discordId) {
      log('user is associated with discord')
      data.associations.push({
        associated: true,
        url: `https://discordapp.com/users/${discordId}`,
        deauthUrl: `${nconf.get('url')}/deauth/${constants.name}`,
        name: constants.displayName,
        icon: constants.admin.icon
      })
    } else {
      log('user is not asscociated with discord')
      data.associations.push({
        associated: false,
        url: `${nconf.get('url')}/auth/${constants.name}`,
        name: constants.displayName,
        icon: constants.admin.icon
      })
    }

    callback(null, data)
  })
}

DiscordAuth.login = function (profile, callback) {
  log('login invoked: %j', profile)
  DiscordAuth.getUidByOAuthid(profile.id, function (err, uid) {
    if (err) {
      logError('could not determine uid from OAuthId: %s', profile.id)
      return callback(err)
    }

    // Existing User
    if (uid !== null) {
      log('user already exists: %s', uid)
      return callback(null, { uid })
    }

    // New User
    log('determing if new user: %s', uid)
    const success = function (uid) {
      log('updating user record with remote service data: (%s, %s)', profile.id, uid)
      // Save provider-specific information to the user
      User.setUserField(uid, constants.name + 'Id', profile.id)
      db.setObjectField(constants.name + 'Id:uid', profile.id, uid)

      if (profile.avatar) {
        User.setUserField(uid, 'uploadedpicture', profile.avatar)
        User.setUserField(uid, 'picture', profile.avatar)
      }

      callback(null, { uid })
    }

    User.getUidByEmail(profile.email, function (err, uid) {
      if (err) {
        logError('could not lookup user by email %s: %s', profile.email, err.message)
        return callback(err)
      }
      if (uid) {
        log('user with email address already exists, merging: %s', profile.email)
        // TODO: this seems easily exploitable
        return success(uid)
      }

      log('creating new user: %s', uid)
      const userFields = {
        username: profile.displayName,
        email: profile.email
      }
      User.create(userFields, function (err, uid) {
        if (err) {
          logError('could not create user %s: %s', uid, err.message)
          return callback(err)
        }
        log('user created')
        success(uid)
      })
    })
  })
}

DiscordAuth.getUidByOAuthid = function (oAuthid, callback) {
  db.getObjectField(constants.name + 'Id:uid', oAuthid, function (err, uid) {
    if (err) {
      logError('could not get object field from database %s: %s', oAuthid, err.message)
      return callback(err)
    }
    callback(null, uid)
  })
}

DiscordAuth.deleteUserData = function (idObj, callback) {
  log('deleteUserData invoked: %j', idObj)
  const operations = [
    async.apply(User.getUserField, idObj.uid, constants.name + 'Id'),
    function (oAuthIdToDelete, next) {
      log('deleting oAuthId: %s', oAuthIdToDelete)
      db.deleteObjectField(constants.name + 'Id:uid', oAuthIdToDelete, next)
    },
    function (next) {
      db.deleteObjectField('user:' + idObj.uid, constants.name + 'Id', next)
    }
  ]
  async.waterfall(operations, function (err) {
    if (err) {
      logError('Could not remove OAuthId data for uid %j. Error: %s', idObj.uid, err.message)
      return callback(err)
    }
    log('finished deleting user: %s', idObj.uid)
    callback(null, idObj.uid)
  })
}

module.exports = DiscordAuth
