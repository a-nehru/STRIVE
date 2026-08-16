#!/bin/bash

if [ $# -lt 3 ]; then
  echo "Usage: $0 <ecosystem_file> <env_name> <region>"
  exit 1
fi

ecosystem_file=$1
env_name=$2
region=$3
vars=$(aws --region "$region" ssm get-parameters-by-path --path "/$env_name" --recursive --with-decryption --output text --query "Parameters[].[Name,Value]" | sed -E "s#\/$env_name/([^[:space:]]*)[[:space:]]*#\1: #" | sed -E "s/: (.*)/: \"\1\",/")
export vars
awk '$1 == "//{REPLACE}" {system("echo $vars"); next} 1' $ecosystem_file > $ecosystem_file.tmp && mv -f $ecosystem_file.tmp $ecosystem_file
