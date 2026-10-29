import { GraphQLScalarType, Kind, type ValueNode } from 'graphql';

// Minimal passthrough scalar for arbitrary JSON metadata objects.
const parseLiteral = (node: ValueNode): unknown => {
  switch (node.kind) {
    case Kind.OBJECT:
      return Object.fromEntries(node.fields.map((field) => [field.name.value, parseLiteral(field.value)]));
    case Kind.LIST:
      return node.values.map(parseLiteral);
    case Kind.STRING:
    case Kind.ENUM:
      return node.value;
    case Kind.INT:
      return parseInt(node.value, 10);
    case Kind.FLOAT:
      return parseFloat(node.value);
    case Kind.BOOLEAN:
      return node.value;
    case Kind.NULL:
      return null;
    default:
      return undefined;
  }
};

export const jsonScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value, used for wallet metadata.',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral,
});
