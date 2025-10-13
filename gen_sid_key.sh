#!/bin/bash

L=26

key=$(openssl rand -base64 $L | tr -d '+/=' | cut -c1-$L)

echo "$key"