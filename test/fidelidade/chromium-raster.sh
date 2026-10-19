#!/usr/bin/env bash
# Rasterização determinística de glifos: modal do host é composto em camada e
# usa antialias cinza; o canvas estático usa LCD colorido. Mesmo modo para ambos.
exec "${FIDELIDADE_CHROMIUM_EXEC:?}" --disable-lcd-text "$@"
