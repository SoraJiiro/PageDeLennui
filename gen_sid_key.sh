#!/bin/bash

L=26

cle=$(openssl rand -base64 $L | tr -d '+/=' | cut -c1-$L)

echo "$cle"