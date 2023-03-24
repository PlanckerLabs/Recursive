#!/bin/bash  -e
# launch bundler: also start geth, and deploy entrypoint.
cd `dirname $0`

BUNDLERPORT=3000
BUNDLERPID=../tmp/bundler-polygon-mumbai.node.pid
VERSION="bundler-polygon-mumbai-0.1"

BUNDLERLOG=../tmp/bundler-polygon-mumbai.log

BUNDLERURL=http://localhost:$BUNDLERPORT/rpc
NODEURL=https://polygon-mumbai.g.alchemy.com/v2/MD-3rBtr93tbYyDY518rqsBGupOGuvOV

function fatal {
  echo "$@" 1>&2
  exit 1
}

function isPortFree {
  port=$1
  curl http://localhost:$port 2>&1 | grep -q Connection.refused
}


function waitForPort {
  port=$1
  while isPortFree $port; do true; done
}

function startBundler {

  isPortFree $BUNDLERPORT || fatal port $BUNDLERPORT not free

  echo == Starting bundler 1>&2
  ts-node -T ./src/exec.ts --config ./localconfig/bundler.config.json --port $BUNDLERPORT --network --unsafe $NODEURL  & echo $! > $BUNDLERPID
  waitForPort $BUNDLERPORT
}

function start {
  isPortFree $BUNDLERPORT || fatal port $BUNDLERPORT not free
  startBundler > $BUNDLERLOG
  echo == Bundler started. log to $BUNDLERLOG
}

function stop {
  echo == stopping bundler
  test -r $BUNDLERPID && kill -9 `cat $BUNDLERPID`
  rm $BUNDLERPID
  echo == bundler stopped
}

function jsoncurl {
  method=$1
  params=$2
  url=$3
  data="{\"method\":\"$method\",\"params\":$params,\"id\":1,\"jsonrpc\":\"2.0\"}"
  curl -s -H content-type:application/json -d $data $url
}

function info {
  entrypoint=`jsoncurl eth_supportedEntryPoints [] $BUNDLERURL | jq -r .result["0"]`
  echo "BUNDLER_ENTRYPOINT=$entrypoint"
  status="down"; test -n "$entrypoint" && status="active"
  echo "BUNDLER_URL=$BUNDLERURL"
  echo "BUNDLER_NODE_URL=$NODEURL"
  echo "BUNDLER_LOG=$BUNDLERLOG"
  echo "BUNDLER_VERSION=$VERSION"
  echo "BUNDLER_STATUS=$status"
}

case $1 in

 start)
	start
	;;
 stop)
 	stop
	;;

  restart)
	echo == restarting bundler
	stop
	start
	;;

  info)
    info
    ;;

 *) echo "usage: $0 {start|stop|restart|info}"
    exit 1 ;;


esac
