/**
 * Initialisation
 */
const { Api, JsonRpc, RpcError } = require('eosjs'),
      ecc = require('eosjs-ecc'),
      { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig'),
      fetch = require('node-fetch'),
      { TextEncoder, TextDecoder } = require('util'),
      { Client } = require('pg')

const http = require('http'),
      url = require('url'),
      querystring = require('querystring')

const endpoint = 'http://213.202.230.42:8888',
      supplier = 'projetsavoir'

/**
 * Postgre
 */
const postgre = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: true
})
postgre.connect()

function saveTransactionInPostgre(p,from,to,tokensAmount) {
  const tokens = parseInt(Math.round(tokensAmount * 10000))
  const query = 'INSERT INTO transactions( senderaccount, receiveraccount, tokensAmount, savoirtopic, savoirname, country, zipcode ) VALUES ( $1, $2, $3, $4, $5, $6, $7 ) RETURNING *'
  const values = [from,to,tokens,p.category,p.name,p.country,p.zipcode]
  postgre.query(query, values, (err, res) => {
    console.log(err ? err.stack : `Row inserted : ${res.rows[0]}`)
  })
}
function getLastTransactionsInPostgre(handler) {
  const query = `SELECT * FROM transactions WHERE senderaccount != '${supplier}' ORDER BY transactionDate DESC LIMIT 10`
  postgre.query(query, (err, res) => {
    console.log(err ? err.stack : '=> getLastTransactionsInPostgre is ok')
    handler(JSON.stringify(res.rows))
  })
}
function getTransactionsOfUserForCategoryInPostgre(category,userAccount,handler) {
  const query = 'SELECT * FROM transactions WHERE savoirtopic = $1 AND (senderaccount = $2 OR receiveraccount = $2) ORDER BY transactionDate DESC'
  const values = [category,userAccount]
  postgre.query(query, values, (err, res) => {
    console.log(err ? err.stack : '=> getTransactionsOfUserForCategoryInPostgre is ok')
    handler(JSON.stringify(res.rows))
  })
}
function getCategoriesOfUser(userAccount,avalaiblesOnly,handler){
  const query = `SELECT t.savoirtopic, SUM(t.tokensamount) as tokensAmount, SUM((t.senderaccount != '${supplier}')::int) as received, SUM((t.senderaccount = '${supplier}')::int) as send FROM transactions as t WHERE receiveraccount = $1 GROUP BY t.savoirtopic`
  const values = [userAccount]
  postgre.query(query, values, (err, res) => {
    console.log(err ? err.stack : '=> getCategoriesOfUser is ok')
    let rows = avalaiblesOnly ? res.rows.filter(d => d.tokensamount > 50) : res.rows
    handler(JSON.stringify(rows))
  })
}
function getSearchResults(searchStr,handler) {
  const queryUsers = `SELECT t.receiveraccount as user, SUM(t.tokensamount) as tokensAmount
  FROM transactions as t
  WHERE t.receiveraccount LIKE '${searchStr}%'
  GROUP BY t.receiveraccount
  ORDER BY tokensAmount DESC
  LIMIT 5`
  const queryCategories = `SELECT t.savoirtopic as topic, COUNT(DISTINCT t.receiveraccount) as users
  FROM transactions as t
  WHERE t.savoirtopic LIKE '${searchStr}%'
  GROUP BY t.savoirtopic
  ORDER BY users DESC
  LIMIT 5`
  postgre.query(queryUsers, (errUsers, resUsers) => {
    console.log(errUsers ? errUsers.stack : '=> getSearchResults users is ok')
    postgre.query(queryCategories, (errCat,resCat) => {
      console.log(errCat ? errCat.stack : '=> getSearchResults categories is ok')
      const results = {
        'users': resUsers.rows,
        'categories': resCat.rows
      }
      handler(JSON.stringify(results))
    })
  })
}
function getUsersForCategory(category,handler) {
  const query = `SELECT t.receiveraccount,
  SUM(t.tokensamount) as tokensOfCategory,
  SUM((t.senderaccount != '${supplier}')::int) as received,
  SUM((t.senderaccount = '${supplier}')::int) as send
  FROM transactions as t
  WHERE t.savoirtopic = $1
  GROUP BY t.receiveraccount
  ORDER BY tokensOfCategory DESC`
  const values = [category]
  postgre.query(query, values, (err, res) => {
    console.log(err ? err.stack : '=> getUsersForCategory is ok')
    handler(JSON.stringify(res.rows))
  })
}
function getUserEmail(accountName,handler) {
  const query = `SELECT * FROM accounts WHERE accountName = '${accountName}' LIMIT 1`
  postgre.query(query, (err, res) => {
    console.log(err ? err.stack : '=> getSearchResults is ok')
    if (res.rows.length > 0) {
      handler(res.rows[0].email)
    } else {
      handler('')
    }
  })
}

/**
 * EOS Blockchain
 */

function saveTransactionInEosBlockchain(destinationAccount,amount,memo) {
  const projetsavoirPrivateKey = "5Jm3i6jc9tVtcH1aLVKUw1o1WmZ3ddHZpFvVYkmjYdbPdrHs97q"
  const signatureProvider = new JsSignatureProvider([projetsavoirPrivateKey])
  const rpc = new JsonRpc(endpoint, { fetch })
  const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() })
  console.log('saveTransactionInEosBlockchain')
  try {
    (async () => {
      try {
        const result = await api.transact({
          actions: [{
            account: supplier,
            name: `transfer`,
            authorization: [{ actor: supplier, permission: `active`, }],
            data: { from: supplier, to: destinationAccount, quantity: `${amount} SOR`, memo: memo },
          }]
        }, {
          blocksBehind: 3, expireSeconds: 30,
        })
        console.dir(result)
      } catch (e) {
        console.log('\nCaught exception: ' + e)
        if (e instanceof RpcError)
          console.log(JSON.stringify(e.json, null, 2))
      }
    })()
  } catch (e) {
    console.log(`Async error : ${e}`);
  }
}

function confirmAccount(pubKey,accountName,handler) {
  const options = { 'public_key':pubKey }
  fetch(`${endpoint}/v1/history/get_key_accounts`, {
    method: 'post',
    body: JSON.stringify(options)
  }).then(function(response) {
      return response.json()
  }).then(function(data) {
      handler(data.account_names.includes(accountName))
  })
}

/**
 * NodeJs Helper
 */
function collectRequestData(request, callback) {
  const FORM_URLENCODED = 'application/x-www-form-urlencoded';
  if(request.headers['content-type'] === FORM_URLENCODED) {
      let body = '';
      request.on('data', chunk => {
          body += chunk.toString();
      });
      request.on('end', () => {
          callback(querystring.parse(body));
      });
  }
  else {
      callback(null);
  }
}

/**
 * Global send tokens function
 */
function confirmAuthentication(p,handler) {
  if (!p.account || p.account.length != 12) {
    handler('Vous n\'avez pas saisi de nom de compte valide.')
    return
  }
  if (!p.accountPrivateKey) {
    handler('Vous n\'avez pas saisi votre clé privée owner.')
    return
  }
  try {
    p.accountPublicKey = ecc.privateToPublic(p.accountPrivateKey)
  } catch {
    handler('La clé privée saisie n\'est pas correcte.')
    return
  }
  confirmAccount(p.accountPublicKey,p.account,(result) => {
    handler(result ? 'ok' : 'Cette clé privée ne correspond pas à votre compte.')
    return
  })
}
function send_tokens(p,handler) {
  if (!p.from || p.from.length != 12) {
    handler('Savoir giver is not correct => Fill the "from" parameter with a 12 characters eos account name')
    return
  }
  if (!p.fromOwnerPrivateKey) {
    handler('Savoir giver private key is null => Fill the "fromOwnerPrivateKey" with your owner private key')
    return
  }
  try {
    p.fromOwnerPublicKey = ecc.privateToPublic(p.fromOwnerPrivateKey)
  } catch {
    handler('Provided key is not a private key')
    return
  }
  if (!p.to) {
    handler('Savoir receivers are not correct  => Fill the "to" parameter with an array of eos accounts name')
    return
  }
  let receivers
  try {
    receivers = JSON.parse(p.to)
  } catch (e) {
    handler('Savoir receivers json array is not correct')
    return
  }
  if (receivers.length == 0 || receivers.includes(p.from)) {
    handler('Savoir receivers are not correct, you can\'t be a receiver')
    return
  }
  receivers.forEach(receiver => {
    if (receiver.length != 12) {
      handler(`${receiver} is not a valid receiver account... Must be 12 characters long`)
      return
    }
  })
  if (p.from == p.to) {
    handler('You can\'t send savoir to yourself')
    return
  }
  if (!p.category) {
    handler('Savoir category is not defined => Fill the "category" parameter')
    return
  }
  if (!p.country || p.country.length != 3) {
    handler('Savoir country is not correct => Fill the "country" parameter with a ISO 3166 Alpha-3 code : https://www.iban.com/country-codes')
    return
  }
  if (!p.zipcode) {
    handler('Savoir zip code is not defined => Fill the "zipcode" parameter')
    return
  }
  if (!p.name) {
    handler('Savoir name is not defined => Fill the "name" parameter')
    return
  }
  confirmAccount(p.fromOwnerPublicKey,p.from,(result) => {
    if (result) {
      const memo = encodeURI(`${p.from}__${p.category}__${p.country}__${p.zipcode}__${p.name}`)
      // Define how many to send to each person
      const receiverAmount = 0.0001
      const giverAmount = 0.0001
      // Send tokens to the savoir receiver
      receivers.forEach(receiver => {
        saveTransactionInPostgre(p,p.from,receiver,receiverAmount)
        saveTransactionInEosBlockchain(receiver,receiverAmount,memo)
      })
      // Send tokens to the savoir giver
      saveTransactionInPostgre(p,supplier,p.from,giverAmount)
      saveTransactionInEosBlockchain(p.from,giverAmount,memo)
      handler('ok')
      return
    } else {
      handler('Private key does not match with the savoir sender')
      return
    }
  })
}
function manually_send_tokens(p,handler) {
  if (!p.receiverAmount) {
    handler('Fill the "receiverAmount" parameter with a number like 0.0001')
    return
  }
  if (!p.giverAmount) {
    handler('Fill the "giverAmount" parameter with a number like 0.0001')
    return
  }
  if (!p.from || p.from.length != 12) {
    handler('Savoir giver is not correct => Fill the "from" parameter with a 12 characters eos account name')
    return
  }
  if (!p.fromOwnerPrivateKey) {
    handler('Savoir giver private key is null => Fill the "fromOwnerPrivateKey" with your owner private key')
    return
  }
  try {
    p.fromOwnerPublicKey = ecc.privateToPublic(p.fromOwnerPrivateKey)
  } catch {
    handler('Provided key is not a private key')
    return
  }
  if (!p.to) {
    handler('Savoir receivers are not correct  => Fill the "to" parameter with an array of eos accounts name')
    return
  }
  let receivers
  try {
    receivers = JSON.parse(p.to)
  } catch (e) {
    handler('Savoir receivers json array is not correct')
    return
  }
  if (receivers.length == 0 || receivers.includes(p.from)) {
    handler('Savoir receivers are not correct, you can\'t be a receiver')
    return
  }
  receivers.forEach(receiver => {
    if (receiver.length != 12) {
      handler(`${receiver} is not a valid receiver account... Must be 12 characters long`)
      return
    }
  })
  if (p.from == p.to) {
    handler('You can\'t send savoir to yourself')
    return
  }
  if (!p.category) {
    handler('Savoir category is not defined => Fill the "category" parameter')
    return
  }
  p.country = "fra"
  if (!p.country || p.country.length != 3) {
    handler('Savoir country is not correct => Fill the "country" parameter with a ISO 3166 Alpha-3 code : https://www.iban.com/country-codes')
    return
  }
  p.zipcode = "94160"
  if (!p.zipcode) {
    handler('Savoir zip code is not defined => Fill the "zipcode" parameter')
    return
  }
  if (!p.name) {
    handler('Savoir name is not defined => Fill the "name" parameter')
    return
  }
  confirmAccount(p.fromOwnerPublicKey,p.from,(result) => {
    if (result) {
      const memo = encodeURI(`${p.from}__${p.category}__${p.country}__${p.zipcode}__${p.name}`)
      // Define how many to send to each person
      const receiverAmount = parseFloat(p.receiverAmount)
      const giverAmount = parseFloat(p.giverAmount)
      // Send tokens to the savoir receiver
      receivers.forEach(receiver => {
        saveTransactionInPostgre(p,p.from,receiver,receiverAmount)
        saveTransactionInEosBlockchain(receiver,p.receiverAmount,memo)
      })
      // // Send tokens to the savoir giver
      saveTransactionInPostgre(p,supplier,p.from,giverAmount)
      saveTransactionInEosBlockchain(p.from,p.giverAmount,memo)
      handler('ok')
      return
    } else {
      handler('Private key does not match with the savoir sender')
      return
    }
  })
}

/**
 * Server rooting
 */

const server = http.createServer(function (req, res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  const page = url.parse(req.url).pathname
  if (page == '/get_users_for_category' && req.method == 'POST') {
    collectRequestData(req, post => {
      if (post.category) {
        getUsersForCategory(post.category,(results) => {
          res.writeHead(200)
          res.end(results)
        })
      } else {
        res.writeHead(200)
        res.end('category parameter is not defined')
      }
    })
  } else if (page == '/get_account_email' && req.method == 'POST') {
    collectRequestData(req, post => {
      if (post.account) {
        getUserEmail(post.account,(email) => {
          res.writeHead(200)
          res.end(email)
        })
      } else {
        res.writeHead(200)
        res.end('account parameter is not defined')
      }
    })
  } else if (page == '/get_avalaible_categories' && req.method == 'POST') {
    collectRequestData(req, post => {
      if (post.account) {
        getCategoriesOfUser(post.account,true,(data) => {
          res.writeHead(200)
          res.end(data)
        })
      } else {
        res.writeHead(200)
        res.end('account property is not defined')
      }
    })
  } else if (page == '/confirm_authentication' && req.method == 'POST') {
    collectRequestData(req, post => {
      confirmAuthentication(post,(response) => {
        res.writeHead(200)
        res.end(response)
      })
    })
  } else if (page == '/send_sor' && req.method == 'POST') {
    collectRequestData(req, post => {
      send_tokens(post,(result) => {
        res.writeHead(200)
        res.end(result)
      })
    })
  } else if (page == '/manually_send_sor' && req.method == 'POST') {
    collectRequestData(req, post => {
      manually_send_tokens(post,(result) => {
        res.writeHead(200)
        res.end(result)
      })
    })
  } else if (page == '/get_last_transactions' && req.method == 'POST') {
    collectRequestData(req, post => {
      getLastTransactionsInPostgre((data) => {
        res.writeHead(200)
        res.end(data)
      })
    })
  } else if (page == '/get_user_categories' && req.method == 'POST') {
    collectRequestData(req, post => {
      if (post.account) {
        getCategoriesOfUser(post.account,false,(data) => {
          res.writeHead(200)
          res.end(data)
        })
      } else {
        res.writeHead(200)
        res.end('Bad parameters for get user categories')
      }
    })
  } else if (page == '/get_transactions_of_user_for_category' && req.method == 'POST') {
    collectRequestData(req, post => {
      if (post.category && post.account) {
        getTransactionsOfUserForCategoryInPostgre(post.category,post.account,(data) => {
          res.writeHead(200)
          res.end(data)
        })
      } else {
        res.writeHead(200)
        res.end('Bad parameters for get transactions of user for category')
      }
    })
  } else if (page == '/get_search_results' && req.method == 'POST') {
    collectRequestData(req, post => {
      getSearchResults(post.search,(data) => {
        res.writeHead(200)
        res.end(data)
      })
    })
  } else {
    res.writeHead(404)
    res.end('Nothing at this url')
  }
})

server.listen(process.env.PORT || 8080, () => {
  console.log(`I run on port ${process.env.PORT || 8080}`)
})