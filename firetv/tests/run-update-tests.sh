#!/bin/sh
# Device-free tests of the updater logic (parse/compare/url allow-list/download/checksum/cancel) against a local HTTPS server.
# Needs a JDK (keytool, javac) and org.json: JSON_JAR=/path/to/json-20240303.jar (https://repo1.maven.org/maven2/org/json/json/20240303/)
set -e
cd "$(dirname "$0")/.."
JAR=${JSON_JAR:-/tmp/json.jar}
T=$(mktemp -d)
keytool -genkeypair -alias t -keyalg RSA -keysize 2048 -dname CN=127.0.0.1 -validity 2 -storetype PKCS12 -keystore $T/t.p12 -storepass testpass -keypass testpass >/dev/null 2>&1
javac -d $T -cp $JAR app/src/main/java/com/faneditfanclub/collection/UpdateLogic.java tests/UpdateLogicTest.java
java -cp $T:$JAR com.faneditfanclub.collection.UpdateLogicTest $T/t.p12
