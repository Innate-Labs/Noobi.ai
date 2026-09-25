import type{GameplayBuildBinding}from'./contracts.js';
import type{ReferenceSpec}from'./visualReferences.js';
export const COMPARISON_DIMENSIONS=['style','camera','action','feedback','rules'] as const;
export type ComparisonDimension=typeof COMPARISON_DIMENSIONS[number];
export type ComparisonFinding='unreviewed'|'aligned'|'differs'|'adapted'|'not-observable';
export interface ComparisonNote {dimension:ComparisonDimension;finding:ComparisonFinding;note:string}
export interface ReferenceComparisonRecord {id:string;createdAt:string;build:GameplayBuildBinding;referenceId:string;referenceHash:string;captureHash:string;cameraAndState:string;notes:ComparisonNote[];source:'manual-record'}
export interface ReferenceComparisonPayload {
 build:GameplayBuildBinding;currentSource:boolean;checkedAt:string;shortRunVerdict:string;requirements:string[];referenceSpec:ReferenceSpec|null;
 references:Array<{id:string;name:string;sha256:string;thumbnail:string;purpose:string}>;
 captures:Array<{sha256:string;name:string;thumbnail:string}>;records:ReferenceComparisonRecord[];
}
export interface SaveReferenceComparisonInput {projectId:string;buildId:string;referenceId:string;captureHash:string;cameraAndState:string;notes:ComparisonNote[]}
