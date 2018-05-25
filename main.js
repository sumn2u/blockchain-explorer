/*
    SPDX-License-Identifier: Apache-2.0
*/

/**
 *
 * Created by shouhewu on 6/8/17.
 *
 */

var log4js = require('log4js');
var loggerS = log4js.getLogger('SampleWebApp');
var express = require("express");
var session = require('express-session');
var cookieParser = require('cookie-parser');
var util = require('util');
var path = require('path');
var app = express();
var http = require('http');
var expressJWT = require('express-jwt');
var bodyParser = require('body-parser');
var helper = require('./app/helper');
var requtil = require('./app/utils/requestutils.js')
var logger = helper.getLogger('main');
var txModel = require('./app/models/transactions.js')
var blocksModel = require('./app/models/blocks.js')
var configuration = require('./app/FabricConfiguration.js')
var url = require('url');
var WebSocket = require('ws');
var jwt = require('jsonwebtoken');
var bearerToken = require('express-bearer-token');
var cors = require('cors');


var query = require('./app/query.js');
var ledgerMgr = require('./app/utils/ledgerMgr.js')

var timer = require('./app/timer/timer.js')
timer.start()


var statusMetrics = require('./app/service/metricservice.js')

app.use(express.static(path.join(__dirname, 'client/build')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

require('./config.js');
var hfc = require('fabric-client');

var sevHelper = require('./app/server-helper.js');
var createChannel = require('./app/create-channel.js');
var join = require('./app/join-channel.js');
var install = require('./app/install-chaincode.js');
var instantiate = require('./app/instantiate-chaincode.js');
var invoke = require('./app/invoke-transaction.js');
var sevQuery = require('./app/server-query.js');
var host = process.env.HOST || hfc.getConfigSetting('host');
var port = process.env.PORT || hfc.getConfigSetting('port');

var config = require('./config.json');
var query = require('./app/query.js');
var sql = require('./app/db/pgservice.js');

var host = process.env.HOST || config.host;
var port = process.env.PORT || config.port;


var networkConfig = config["network-config"];
var org = Object.keys(networkConfig)[0];
var orgObj = config["network-config"][org];
var orgKey = Object.keys(orgObj);
var index = orgKey.indexOf("peer1");
var peer = orgKey[index];

console.log("org ==>", org)

var unprotected = [
    /\/api*/,
	/favicon.ico/,
	/\/users*/
  ];
///////////////////////////////////////////////////////////////////////////////
//////////////////////////////// SET CONFIGURATONS ////////////////////////////
///////////////////////////////////////////////////////////////////////////////
app.options('*', cors());
app.use(cors());
//support parsing of application/json type post data
app.use(bodyParser.json());
//support parsing of application/x-www-form-urlencoded post data
app.use(bodyParser.urlencoded({
	extended: false
}));
// set secret variable
app.set('secret', 'thisismysecret');
app.use(expressJWT({
	secret: 'thisismysecret'
}).unless({
	path: unprotected
}));
app.use(bearerToken());

app.all('/apis/*', [require('./middlewares/validateRequest')]);


//app.use('/api', require('./routes'));

// =======================   controller  ===================

/**
Return latest status
GET /api/status/get - > /api/status
curl -i 'http://<host>:<port>/api/status/<channel>'
Response:
{
  "chaincodeCount": 1,
  "txCount": 3,
  "latestBlock": 2,
  "peerCount": 1
}
 *
 */

app.get("/api/status/:channel", function (req, res) {
    let channelName = req.params.channel
    if (channelName) {
        statusMetrics.getStatus(channelName, function (data) {
            if (data && (data.chaincodeCount && data.txCount && data.latestBlock && data.peerCount)) {
                return res.send(data)
            } else {
                return requtil.notFound(req, res)
            }
        })
    }
    else {
        return requtil.invalidRequest(req, res)
    }
});


/**
Return list of channels
GET /channellist -> /api/channels
curl -i http://<host>:<port>/api/channels
Response:
{
  "channels": [
    {
    "channel_id": "mychannel"
    }
  ]
}
 */

app.get('/api/channels', function (req, res) {
    var channels = [], counter = 0;
    const orgs_peers = configuration.getOrgMapFromConfig();

    orgs_peers.forEach(function (org) {
        query.getChannels(org['value'], org['key']).then(channel => {
            channel['channels'].forEach(function (element) {
                channels.push(element['channel_id']);
            });
            if (counter == orgs_peers.length - 1) {
                var response = { status: 200 };
                response["channels"] = [...(new Set(channels))]
                res.send(response);
            }
            counter++;
        });
    })
})
/**
Return current channel
GET /api/curChannel
curl -i 'http://<host>:<port>/api/curChannel'
*/
app.get('/api/curChannel', function (req, res) {
    res.send({ 'currentChannel': ledgerMgr.getCurrChannel() })
})
/***
Block by number
GET /api/block/getinfo -> /api/block
curl -i 'http://<host>:<port>/api/block/<channel>/<number>'
 *
 */
app.get("/api/block/:channel/:number", function (req, res) {
    let number = parseInt(req.params.number)
    let channelName = req.params.channel
    if (!isNaN(number) && channelName) {
        query.getBlockByNumber(peer, channelName, number, org)
            .then(block => {
                res.send({
                    status: 200,
                    'number': block.header.number.toString(),
                    'previous_hash': block.header.previous_hash,
                    'data_hash': block.header.data_hash,
                    'transactions': block.data.data
                })
            })
    } else {
        return requtil.invalidRequest(req, res)
    }
});

/***
Transaction count
GET /api/block/get -> /api/block/transactions/
curl -i 'http://<host>:<port>/api/block/transactions/<channel>/<number>'
Response:
{
  "number": 2,
  "txCount": 1
}
 */
app.get("/api/block/transactions/:channel/:number", function (req, res) {
    let number = parseInt(req.params.number)
    let channelName = req.params.channel
    if (!isNaN(number) && channelName) {
        sql.getRowByPkOne(`select blocknum ,txcount from blocks where channelname='${channelName}' and blocknum=${number} `).then(row => {
            if (row) {
                return res.send({
                    status: 200,
                    'number': row.blocknum,
                    'txCount': row.txcount
                })
            }
            return requtil.notFound(req, res)
        })
    } else {
        return requtil.invalidRequest(req, res)
    }
});
//
/***
Transaction Information
GET /api/tx/getinfo -> /api/transaction/<txid>
curl -i 'http://<host>:<port>/api/transaction/<channel>/<txid>'
Response:
{
  "tx_id": "header.channel_header.tx_id",
  "timestamp": "header.channel_header.timestamp",
  "channel_id": "header.channel_header.channel_id",
  "type": "header.channel_header.type"
}
 */

app.get("/api/transaction/:channel/:txid", function (req, res) {
    let txid = req.params.txid
    let channelName = req.params.channel
    if (txid && txid != '0' && channelName) {
        txModel.getTransactionByID(channelName, txid).then(row => {
            if (row) {
                return res.send({ status: 200, row })
            }
        })
    } else {
        return requtil.invalidRequest(req, res)
    }
});


/***
Transaction list
GET /api/txList/
curl -i 'http://<host>:<port>/api/txList/<channel>/<blocknum>/<txid>/<limitrows>/<offset>'
Response:
{"rows":[{"id":56,"channelname":"mychannel","blockid":24,
"txhash":"c42c4346f44259628e70d52c672d6717d36971a383f18f83b118aaff7f4349b8",
"createdt":"2018-03-09T19:40:59.000Z","chaincodename":"mycc"}]}
 */
app.get("/api/txList/:channel/:blocknum/:txid", function (req, res) {

    let channelName = req.params.channel;
    let blockNum = parseInt(req.params.blocknum);
    let txid = parseInt(req.params.txid);

    if (isNaN(txid)) {
        txid = 0;
    }
    if (channelName) {
        txModel.getTxList(channelName, blockNum, txid)
            .then(rows => {
                if (rows) {
                    return res.send({ status: 200, rows })
                }
            })
    } else {
        return requtil.invalidRequest(req, res)
    }
});


/***Peer List
GET /peerlist -> /api/peers
curl -i 'http://<host>:<port>/api/peers/<channel>'
Response:
[
  {
    "requests": "grpcs://127.0.0.1:7051",
    "server_hostname": "peer0.org1.example.com"
  }
]
 */
app.get("/api/peers/:channel", function (req, res) {
    let channelName = req.params.channel
    if (channelName) {
        statusMetrics.getPeerList(channelName, function (data) {
            res.send({ status: 200, peers: data })
        })
    } else {
        return requtil.invalidRequest(req, res)
    }
});


/**
Chaincode list
GET /chaincodelist -> /api/chaincode
curl -i 'http://<host>:<port>/api/chaincode/<channel>'
Response:
[
  {
    "channelName": "mychannel",
    "chaincodename": "mycc",
    "path": "github.com/hyperledger/fabric/examples/chaincode/go/chaincode_example02",
    "version": "1.0",
    "txCount": 0
  }
]
 */

app.get('/api/chaincode/:channel', function (req, res) {
    let channelName = req.params.channel
    if (channelName) {
        statusMetrics.getTxPerChaincode(channelName, function (data) {
            res.send({ status: 200, chaincode: data })
        })
    } else {
        return requtil.invalidRequest(req, res)
    }
})

/***
 List of blocks and transaction list per block
GET /api/blockAndTxList
curl -i 'http://<host>:<port>/api/blockAndTxList/channel/<blockNum>/<limitrows>/<offset>'
Response:
{"rows":[{"id":51,"blocknum":50,"datahash":"374cceda1c795e95fc31af8f137feec8ab6527b5d6c85017dd8088a456a68dee",
"prehash":"16e76ca38975df7a44d2668091e0d3f05758d6fbd0aab76af39f45ad48a9c295","channelname":"mychannel","txcount":1,
"createdt":"2018-03-13T15:58:45.000Z","txhash":["6740fb70ed58d5f9c851550e092d08b5e7319b526b5980a984b16bd4934b87ac"]}]}
 *
 */

app.get("/api/blockAndTxList/:channel/:blocknum", function (req, res) {

    let channelName = req.params.channel;
    let blockNum = parseInt(req.params.blocknum);

    if (channelName && !isNaN(blockNum)) {
        blocksModel.getBlockAndTxList(channelName, blockNum)
            .then(rows => {
                if (rows) {
                    return res.send({ status: 200, rows })
                }
                return requtil.notFound(req, res)
            })
    } else {
        return requtil.invalidRequest(req, res)
    }
});

// TRANSACTION METRICS

/***
 Transactions per minute with hour interval
GET /api/txByMinute
curl -i 'http://<host>:<port>/api/txByMinute/<channel>/<hours>'
Response:
{"rows":[{"datetime":"2018-03-13T17:46:00.000Z","count":"0"},{"datetime":"2018-03-13T17:47:00.000Z","count":"0"},{"datetime":"2018-03-13T17:48:00.000Z","count":"0"},{"datetime":"2018-03-13T17:49:00.000Z","count":"0"},{"datetime":"2018-03-13T17:50:00.000Z","count":"0"},{"datetime":"2018-03-13T17:51:00.000Z","count":"0"},
{"datetime":"2018-03-13T17:52:00.000Z","count":"0"},{"datetime":"2018-03-13T17:53:00.000Z","count":"0"}]}

 */

app.get("/api/txByMinute/:channel/:hours", function (req, res) {
    let channelName = req.params.channel;
    let hours = parseInt(req.params.hours);

    if (channelName && !isNaN(hours)) {
        statusMetrics.getTxByMinute(channelName, hours)
            .then(rows => {
                if (rows) {
                    return res.send({ status: 200, rows })
                }
                return requtil.notFound(req, res)
            })
    } else {
        return requtil.invalidRequest(req, res)
    }
});

/***
 Transactions per hour(s) with day interval
GET /api/txByHour
curl -i 'http://<host>:<port>/api/txByHour/<channel>/<days>'
Response:
{"rows":[{"datetime":"2018-03-12T19:00:00.000Z","count":"0"},
{"datetime":"2018-03-12T20:00:00.000Z","count":"0"}]}
 */

app.get("/api/txByHour/:channel/:days", function (req, res) {
    let channelName = req.params.channel;
    let days = parseInt(req.params.days);

    if (channelName && !isNaN(days)) {
        statusMetrics.getTxByHour(channelName, days)
            .then(rows => {
                if (rows) {
                    return res.send({ status: 200, rows })
                }
                return requtil.notFound(req, res)
            })
    } else {
        return requtil.invalidRequest(req, res)
    }
});

// BLOCK METRICS

/***
 Blocks per minute with hour interval
GET /api/blocksByMinute
curl -i 'http://<host>:<port>/api/blocksByMinute/<channel>/<hours>'
Response:
{"rows":[{"datetime":"2018-03-13T19:59:00.000Z","count":"0"}]}

*/

app.get("/api/blocksByMinute/:channel/:hours", function (req, res) {
    let channelName = req.params.channel;
    let hours = parseInt(req.params.hours);

    if (channelName && !isNaN(hours)) {
        statusMetrics.getBlocksByMinute(channelName, hours)
            .then(rows => {
                if (rows) {
                    return res.send({ status: 200, rows })
                }
                return requtil.notFound(req, res)
            })
    } else {
        return requtil.invalidRequest(req, res)
    }
});


/***
 Blocks per hour(s) with day interval
GET /api/blocksByHour
curl -i 'http://<host>:<port>/api/blocksByHour/<channel>/<days>'
Response:
{"rows":[{"datetime":"2018-03-13T20:00:00.000Z","count":"0"}]}

*/

app.get("/api/blocksByHour/:channel/:days", function (req, res) {
    let channelName = req.params.channel;
    let days = parseInt(req.params.days);

    if (channelName && !isNaN(days)) {
        statusMetrics.getBlocksByHour(channelName, days)
            .then(rows => {
                if (rows) {
                    return res.send({ status: 200, rows })
                }
                return requtil.notFound(req, res)
            })
    } else {
        return requtil.invalidRequest(req, res)
    }
});

/***
 Transactions by Organization(s)
GET /api/txByOrg
curl -i 'http://<host>:<port>/api/txByOrg/<channel>'
Response:
{"rows":[{"count":"4","creator_msp_id":"Org1"}]}

*/
app.get("/api/txByOrg/:channel", function (req, res) {
    let channelName = req.params.channel;

    if (channelName) {
        statusMetrics.getTxByOrgs(channelName)
            .then(rows => {
                if (rows) {
                    return res.send({ status: 200, rows })
                }
                return requtil.notFound(req, res)
            })
    } else {
        return requtil.invalidRequest(req, res)
    }
});
/***
    An API to create a channel
POST /api/channel
curl -s -X POST http://localhost:8080/api/channel
Response: {"status":"SUCCESS","info":""}
*/
app.post('/api/channel', function (req, res) {
    var channelName = req.body.channelName;
    var channelConfigPath = req.body.channelConfigPath;
    var orgName = req.body.orgName;
    var orgPath = req.body.orgPath;
    var networkCfgPath = req.body.networkCfgPath;

    //Validate inputs
    if (!channelName) {
        res.json(getErrorMessage('\'channelName\''));
        return;
    }
    if (!channelConfigPath) {
        res.json(getErrorMessage('\'channelConfigPath\''));
        return;
    }
    if (!orgName) {
        res.json(getErrorMessage('\'orgName\''));
        return;
    }
    if (!orgPath) {
        res.json(getErrorMessage('\'orgPath\''));
        return;
    }
    if (!networkCfgPath) {
        res.json(getErrorMessage('\'networkCfgPath\''));
        return;
    }

    let resMess = channelService.createChannel(channelName, channelConfigPath, orgName, orgPath, networkCfgPath);
    res.send(resMess);
});


function getErrorMessage(field) {
	var response = {
		success: false,
		message: field + ' field is missing or Invalid in the request'
	};
	return response;
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////// REST ENDPOINTS START HERE ///////////////////////////
///////////////////////////////////////////////////////////////////////////////
// Register and enroll user
app.post('/users', async function(req, res) {
	var username = req.body.username;
	var orgName = req.body.orgName;
	loggerS.debug('End point : /users');
	loggerS.debug('User name : ' + username);
	loggerS.debug('Org name  : ' + orgName);
	if (!username) {
		res.json(getErrorMessage('\'username\''));
		return;
	}
	if (!orgName) {
		res.json(getErrorMessage('\'orgName\''));
		return;
	}
	var token = jwt.sign({
		exp: Math.floor(Date.now() / 1000) + parseInt(hfc.getConfigSetting('jwt_expiretime')),
		username: username,
		orgName: orgName
	}, app.get('secret'));
	let response = await sevHelper.getRegisteredUser(username, orgName, true);
	loggerS.debug('-- returned from registering the username %s for organization %s',username,orgName);
	if (response && typeof response !== 'string') {
		loggerS.debug('Successfully registered the username %s for organization %s',username,orgName);
		response.token = token;
		res.json(response);
	} else {
		loggerS.debug('Failed to register the username %s for organization %s with::%s',username,orgName,response);
		res.json({success: false, message: response});
	}

});
// Create Channel
app.post('/apis/channels', async function(req, res) {
	loggerS.info('<<<<<<<<<<<<<<<<< C R E A T E  C H A N N E L >>>>>>>>>>>>>>>>>');
	loggerS.debug('End point : /channels');
	var channelName = req.body.channelName;
	var channelConfigPath = req.body.channelConfigPath;
	loggerS.debug('Channel name : ' + channelName);
	loggerS.debug('channelConfigPath : ' + channelConfigPath); //../artifacts/channel/mychannel.tx
	if (!channelName) {
		res.json(getErrorMessage('\'channelName\''));
		return;
	}
	if (!channelConfigPath) {
		res.json(getErrorMessage('\'channelConfigPath\''));
		return;
	}

	let message = await createChannel.createChannel(channelName, channelConfigPath, req.username, req.orgname);
	res.send(message);
});
// Join Channel
app.post('/apis/channels/:channelName/peers', async function(req, res) {
	loggerS.info('<<<<<<<<<<<<<<<<< J O I N  C H A N N E L >>>>>>>>>>>>>>>>>');
	var channelName = req.params.channelName;
	var peers = req.body.peers;
	loggerS.debug('channelName : ' + channelName);
	loggerS.debug('peers : ' + peers);
	loggerS.debug('username :' + req.username);
	loggerS.debug('orgname:' + req.orgname);

	if (!channelName) {
		res.json(getErrorMessage('\'channelName\''));
		return;
	}
	if (!peers || peers.length == 0) {
		res.json(getErrorMessage('\'peers\''));
		return;
	}

	let message =  await join.joinChannel(channelName, peers, req.username, req.orgname);
	res.send(message);
});
// Install chaincode on target peers
app.post('/apis/chaincodes', async function(req, res) {
	loggerS.debug('==================== INSTALL CHAINCODE ==================');
	var peers = req.body.peers;
	var chaincodeName = req.body.chaincodeName;
	var chaincodePath = req.body.chaincodePath;
	var chaincodeVersion = req.body.chaincodeVersion;
	var chaincodeType = req.body.chaincodeType;
	loggerS.debug('peers : ' + peers); // target peers list
	loggerS.debug('chaincodeName : ' + chaincodeName);
	loggerS.debug('chaincodePath  : ' + chaincodePath);
	loggerS.debug('chaincodeVersion  : ' + chaincodeVersion);
	loggerS.debug('chaincodeType  : ' + chaincodeType);
	if (!peers || peers.length == 0) {
		res.json(getErrorMessage('\'peers\''));
		return;
	}
	if (!chaincodeName) {
		res.json(getErrorMessage('\'chaincodeName\''));
		return;
	}
	if (!chaincodePath) {
		res.json(getErrorMessage('\'chaincodePath\''));
		return;
	}
	if (!chaincodeVersion) {
		res.json(getErrorMessage('\'chaincodeVersion\''));
		return;
	}
	if (!chaincodeType) {
		res.json(getErrorMessage('\'chaincodeType\''));
		return;
	}
	let message = await install.installChaincode(peers, chaincodeName, chaincodePath, chaincodeVersion, chaincodeType, req.username, req.orgname)
	res.send(message);});
// Instantiate chaincode on target peers
app.post('/apis/channels/:channelName/chaincodes', async function(req, res) {
	loggerS.debug('==================== INSTANTIATE CHAINCODE ==================');
	var peers = req.body.peers;
	var chaincodeName = req.body.chaincodeName;
	var chaincodeVersion = req.body.chaincodeVersion;
	var channelName = req.params.channelName;
	var chaincodeType = req.body.chaincodeType;
	var fcn = req.body.fcn;
	var args = req.body.args;
	loggerS.debug('peers  : ' + peers);
	loggerS.debug('channelName  : ' + channelName);
	loggerS.debug('chaincodeName : ' + chaincodeName);
	loggerS.debug('chaincodeVersion  : ' + chaincodeVersion);
	loggerS.debug('chaincodeType  : ' + chaincodeType);
	loggerS.debug('fcn  : ' + fcn);
	loggerS.debug('args  : ' + args);
	if (!chaincodeName) {
		res.json(getErrorMessage('\'chaincodeName\''));
		return;
	}
	if (!chaincodeVersion) {
		res.json(getErrorMessage('\'chaincodeVersion\''));
		return;
	}
	if (!channelName) {
		res.json(getErrorMessage('\'channelName\''));
		return;
	}
	if (!chaincodeType) {
		res.json(getErrorMessage('\'chaincodeType\''));
		return;
	}
	if (!args) {
		res.json(getErrorMessage('\'args\''));
		return;
	}

	let message = await instantiate.instantiateChaincode(peers, channelName, chaincodeName, chaincodeVersion, chaincodeType, fcn, args, req.username, req.orgname);
	res.send(message);
});
// Invoke transaction on chaincode on target peers
app.post('/apis/channels/:channelName/chaincodes/:chaincodeName', async function(req, res) {
	loggerS.debug('==================== INVOKE ON CHAINCODE ==================');
	var peers = req.body.peers;
	var chaincodeName = req.params.chaincodeName;
	var channelName = req.params.channelName;
	var fcn = req.body.fcn;
	var args = req.body.args;
	loggerS.debug('channelName  : ' + channelName);
	loggerS.debug('chaincodeName : ' + chaincodeName);
	loggerS.debug('fcn  : ' + fcn);
	loggerS.debug('args  : ' + args);
	if (!chaincodeName) {
		res.json(getErrorMessage('\'chaincodeName\''));
		return;
	}
	if (!channelName) {
		res.json(getErrorMessage('\'channelName\''));
		return;
	}
	if (!fcn) {
		res.json(getErrorMessage('\'fcn\''));
		return;
	}
	if (!args) {
		res.json(getErrorMessage('\'args\''));
		return;
	}

	let message = await invoke.invokeChaincode(peers, channelName, chaincodeName, fcn, args, req.username, req.orgname);
	res.send(message);
});
// Query on chaincode on target peers
app.get('/apis/channels/:channelName/chaincodes/:chaincodeName', async function(req, res) {
	loggerS.debug('==================== QUERY BY CHAINCODE ==================');
	var channelName = req.params.channelName;
	var chaincodeName = req.params.chaincodeName;
	let args = req.query.args;
	let fcn = req.query.fcn;
	let peer = req.query.peer;

	loggerS.debug('channelName : ' + channelName);
	loggerS.debug('chaincodeName : ' + chaincodeName);
	loggerS.debug('fcn : ' + fcn);
	loggerS.debug('args : ' + args);

	if (!chaincodeName) {
		res.json(getErrorMessage('\'chaincodeName\''));
		return;
	}
	if (!channelName) {
		res.json(getErrorMessage('\'channelName\''));
		return;
	}
	if (!fcn) {
		res.json(getErrorMessage('\'fcn\''));
		return;
	}
	if (!args) {
		res.json(getErrorMessage('\'args\''));
		return;
	}
	args = args.replace(/'/g, '"');
	args = JSON.parse(args);
	loggerS.debug(args);

	let message = await sevQuery.queryChaincode(peer, channelName, chaincodeName, args, fcn, req.username, req.orgname);
	res.send(message);
});
//  Query Get Block by BlockNumber
app.get('/apis/channels/:channelName/blocks/:blockId', async function(req, res) {
	loggerS.debug('==================== GET BLOCK BY NUMBER ==================');
	let blockId = req.params.blockId;
	let peer = req.query.peer;
	loggerS.debug('channelName : ' + req.params.channelName);
	loggerS.debug('BlockID : ' + blockId);
	loggerS.debug('Peer : ' + peer);
	if (!blockId) {
		res.json(getErrorMessage('\'blockId\''));
		return;
	}

	let message = await sevQuery.getBlockByNumber(peer, req.params.channelName, blockId, req.username, req.orgname);
	res.send(message);
});
// Query Get Transaction by Transaction ID
app.get('/apis/channels/:channelName/transactions/:trxnId', async function(req, res) {
	loggerS.debug('================ GET TRANSACTION BY TRANSACTION_ID ======================');
	loggerS.debug('channelName : ' + req.params.channelName);
	let trxnId = req.params.trxnId;
	let peer = req.query.peer;
	if (!trxnId) {
		res.json(getErrorMessage('\'trxnId\''));
		return;
	}

	let message = await sevQuery.getTransactionByID(peer, req.params.channelName, trxnId, req.username, req.orgname);
	res.send(message);
});
// Query Get Block by Hash
app.get('/apis/channels/:channelName/blocks', async function(req, res) {
	loggerS.debug('================ GET BLOCK BY HASH ======================');
	loggerS.debug('channelName : ' + req.params.channelName);
	let hash = req.query.hash;
	let peer = req.query.peer;
	if (!hash) {
		res.json(getErrorMessage('\'hash\''));
		return;
	}

	let message = await sevQuery.getBlockByHash(peer, req.params.channelName, hash, req.username, req.orgname);
	res.send(message);
});
//Query for Channel Information
app.get('/apis/channels/:channelName', async function(req, res) {
	loggerS.debug('================ GET CHANNEL INFORMATION ======================');
	loggerS.debug('channelName : ' + req.params.channelName);
	let peer = req.query.peer;

	let message = await sevQuery.getChainInfo(peer, req.params.channelName, req.username, req.orgname);
	res.send(message);
});
//Query for Channel instantiated chaincodes
app.get('/apis/channels/:channelName/chaincodes', async function(req, res) {
	loggerS.debug('================ GET INSTANTIATED CHAINCODES ======================');
	loggerS.debug('channelName : ' + req.params.channelName);
	let peer = req.query.peer;

	let message = await sevQuery.getInstalledChaincodes(peer, req.params.channelName, 'instantiated', req.username, req.orgname);
	res.send(message);
});
// Query to fetch all Installed/instantiated chaincodes
app.get('/apis/chaincodes', async function(req, res) {
	var peer = req.query.peer;
	var installType = req.query.type;
	loggerS.debug('================ GET INSTALLED CHAINCODES ======================');

	let message = await sevQuery.getInstalledChaincodes(peer, null, 'installed', req.username, req.orgname)
	res.send(message);
});
// Query to fetch channels
app.get('/apis/channels', async function(req, res) {
	loggerS.debug('================ GET CHANNELS ======================');
	loggerS.debug('peer: ' + req.query.peer);
	var peer = req.query.peer;
	if (!peer) {
		res.json(getErrorMessage('\'peer\''));
		return;
	}

	let message = await sevQuery.getChannels(peer, req.username, req.orgname);
	res.send(message);
});

//============ web socket ==============//
var server = http.createServer(app);
var wss = new WebSocket.Server({ server });
wss.on('connection', function connection(ws, req) {
    const location = url.parse(req.url, true);
    // You might use location.query.access_token to authenticate or share sessions
    // or req.headers.cookie (see http://stackoverflow.com/a/16395220/151312)

    ws.on('message', function incoming(message) {
        console.log('received: %s', message);
    });

});

function broadcast(data) {
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};
exports.wss = wss;
exports.broadcast = broadcast;
// ============= start server =======================
server.listen(port, function () {
    console.log(`Please open web browser to access ：http://${host}:${port}/`);
});


// this is for the unit testing
//module.exports = app;