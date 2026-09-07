import {
  createSerializer,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
} from "nuqs";

export const searchParamsParsers = {
  dice: parseAsString.withDefault(""),
  total: parseAsInteger.withDefault(20),
  wild: parseAsBoolean.withDefault(true),
  bid: parseAsInteger,
};

export const serialize = createSerializer(searchParamsParsers);
