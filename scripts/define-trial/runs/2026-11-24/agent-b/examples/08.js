// REFUSED: (no code) inspecting the built program is not part of the Definition API.
// The draft's .build() returns the record (plain data, rules "The record"), not an IR with
// nodes, phases, a listing, lineage, downstreamOf, diff or toJSON. The Program itself is example 04;
// what this example does with it happens after the language is defined, in tooling the draft does not describe.
//
// Of what is asked:
//   built.ir.nodes / phase        : no phases (no build-time lambdas, R8); the record's table[i].calls is the nearest thing.
//   built.listing()               : not in the draft.
//   built.lineage("trend", "revenue"), built.downstreamOf("$metric"): need each lambda's free names;
//                                   environment() and checks get the source text only (src), not its parse.
//   built.diff(next)              : not in the draft; and re-declaring .table("monthly", …) is B002 (name declared twice),
//                                   so "add a step to monthly" cannot even be written as a second Program call.
//   built.ir.toJSON()             : the record is already JSON-shaped data; JSON.stringify of it is the nearest thing.
