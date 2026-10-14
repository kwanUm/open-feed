#!/bin/bash

build() {
    echo 'Building OpenFeed...'
    rm -rf dist
    # Must precede vite: it writes into public/, which vite copies verbatim.
    ./script/build-export-core.sh
    vite build "$@"
}

build "$@"